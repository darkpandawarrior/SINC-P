/**
 * Every write path for a grievance.
 *
 * One rule holds across all of them: the state change and its audit event are written in
 * the same transaction, so a crash between the two is impossible. That atomicity is the
 * compliance claim, which is why the writes live together rather than beside the reads.
 */
import { and, eq } from 'drizzle-orm'
import { withTenant, type Tx } from '@/db/client'
import {
  attachments,
  categories,
  grievances,
  institutions,
  users,
  type Attachment,
  type Grievance,
  type GrievanceEvent,
} from '@/db/schema'
import {
  canAssign,
  canComment,
  canSetStatus,
  isOpen,
  isStaff,
  type Actor,
  type Status,
} from './policy'
import { referencePrefix, withRetriedReference } from './reference'
import { computeDueAt } from './sla'
import {
  AddAttachmentInput,
  BulkResult,
  FileAppealInput,
  FileAppealResult,
  SubmitGrievanceInput,
  TransitionResult,
  addAttachmentInputSchema,
  appendEvent,
  bulkIdsSchema,
  fileAppealInputSchema,
  loadGrievance,
  remarkSchema,
  submitGrievanceInputSchema,
  toActorView,
  toStatusSchema,
  uuidSchema,
  visibilitySchema,
  ConcurrentTransitionError,
} from './_internal'
import { enqueue } from '@/lib/notify/outbox'
import * as tpl from '@/lib/notify/templates'

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function submitGrievance(actor: Actor, input: SubmitGrievanceInput): Promise<Grievance> {
  const parsed = submitGrievanceInputSchema.parse(input)

  return withTenant(actor.institutionId, async (tx) => {
    const [institution] = await tx
      .select()
      .from(institutions)
      .where(eq(institutions.id, actor.institutionId))
      .limit(1)
    if (!institution) throw new Error('submitGrievance: institution not found')

    if (parsed.isAnonymous && !institution.allowAnonymous) {
      throw new Error('submitGrievance: this institution does not allow anonymous filing')
    }

    const [category] = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, parsed.categoryId), eq(categories.institutionId, actor.institutionId)))
      .limit(1)
    if (!category || !category.isActive) {
      throw new Error('submitGrievance: unknown or inactive category')
    }

    const now = new Date()
    // The category decides which statutory regime this grievance belongs to, and the
    // regime decides both the clock and who may ever see it.
    const track = category.track

    const dueAt =
      track === 'icc'
        ? // Regulation 7 of the UGC 2015 Regulations: the ICC inquiry completes within
          // ninety days. Calendar days, because that clause does not say working.
          computeDueAt(now, { institutionSlaDays: institution.slaIccInquiryDays, mode: 'calendar' })
        : computeDueAt(now, {
            institutionSlaDays: institution.slaResolutionDays,
            categorySlaDays: category.slaResolutionDays,
            // The UGC 2023 clause counts working days. See the note on the schema column.
            mode: institution.slaUseWorkingDays ? 'working' : 'calendar',
          })

    // ponytail: the reference year uses the server's UTC calendar year, not the IST one
    // sla.ts is careful to compute in. A grievance filed in the ~5.5h UTC/IST gap
    // around New Year's could land a few hours into next year's numbering early.
    // Cosmetic only — the SLA clock (what an auditor actually checks) always goes
    // through sla.ts's IST arithmetic; the reference is just a label. Upgrade if a
    // college ever files at midnight IST on Dec 31 and complains.
    const year = now.getUTCFullYear()
    const prefix = referencePrefix(institution.slug)

    const grievance = await withRetriedReference(tx, actor.institutionId, prefix, year, async (sp, reference) => {
      const [row] = await sp
        .insert(grievances)
        .values({
          institutionId: actor.institutionId,
          reference,
          submittedById: actor.id,
          isAnonymous: parsed.isAnonymous,
          categoryId: parsed.categoryId,
          kind: parsed.kind,
          subject: parsed.subject,
          body: parsed.body,
          status: 'submitted',
          track,
          dueAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      if (!row) throw new Error('submitGrievance: insert returned no row')
      return row
    })

    await appendEvent(tx, actor.institutionId, grievance.id, {
      type: 'submitted',
      actorId: actor.id,
      actorRole: actor.role,
      remark: null,
      payload: { categoryId: parsed.categoryId, kind: parsed.kind },
      visibility: 'public',
    })

    await notifyFiler(tx, actor, grievance, 'grievance_submitted')

    return toActorView(actor, grievance)
  })
}

export async function transitionStatus(
  actor: Actor,
  grievanceId: string,
  to: Status,
  remark?: string,
): Promise<TransitionResult> {
  const validTo = toStatusSchema.parse(to)
  const validRemark = remark === undefined ? undefined : remarkSchema.parse(remark)

  return withTenant(actor.institutionId, async (tx) => {
    const grievance = await loadGrievance(tx, actor.institutionId, grievanceId)
    if (!grievance) return { ok: false, reason: 'not-visible' }

    const denial = canSetStatus(actor, grievance, validTo)
    if (!denial.ok) return denial

    const now = new Date()
    const patch: Partial<typeof grievances.$inferInsert> = { status: validTo, updatedAt: now }
    if (validTo === 'resolved') patch.resolvedAt = now
    // Reuse isOpen rather than re-deriving "which statuses are terminal" a second
    // time — TERMINAL_STATUSES lives in policy.ts precisely so this list has one home.
    if (!isOpen(validTo)) patch.closedAt = now

    // CAS on the status we actually read: two staff racing from the same starting
    // status must not both commit a transition canSetStatus only checked against a
    // stale snapshot. A losing UPDATE means the row moved under us since loadGrievance
    // — the transition this caller thought was legal no longer is, so it's reported
    // exactly like any other illegal transition rather than throwing. Nothing else has
    // been written in this transaction yet, so there's nothing to unwind.
    const [updated] = await tx
      .update(grievances)
      .set(patch)
      .where(
        and(
          eq(grievances.id, grievanceId),
          eq(grievances.institutionId, actor.institutionId),
          eq(grievances.status, grievance.status),
        ),
      )
      .returning()
    if (!updated) return { ok: false, reason: 'illegal-transition' }

    await appendEvent(tx, actor.institutionId, grievanceId, {
      type: 'status_changed',
      actorId: actor.id,
      actorRole: actor.role,
      remark: validRemark ?? null,
      payload: { from: grievance.status, to: validTo },
      visibility: 'public',
    })

    // The student hears about every public status change except the one they made
    // themselves; telling someone what they just did is noise that trains people to
    // filter the address.
    if (actor.id !== updated.submittedById) {
      await notifyFiler(tx, actor, updated, 'status_changed', validRemark ?? null)
    }

    return { ok: true, grievance: toActorView(actor, updated) }
  })
}

export async function withdrawGrievance(
  actor: Actor,
  grievanceId: string,
  remark?: string,
): Promise<TransitionResult> {
  return transitionStatus(actor, grievanceId, 'withdrawn', remark)
}

export async function assignGrievance(
  actor: Actor,
  grievanceId: string,
  assigneeId: string,
): Promise<Grievance | null> {
  const validAssigneeId = uuidSchema.parse(assigneeId)

  return withTenant(actor.institutionId, async (tx) => {
    const grievance = await loadGrievance(tx, actor.institutionId, grievanceId)
    if (!grievance || !canAssign(actor, grievance)) return null

    // Only the two roles that actually work a queue are legal assignment targets, and
    // only within the same institution — RLS would stop a cross-tenant assignee too,
    // but failing here means the caller gets null instead of an FK-constraint 500.
    const [assignee] = await tx
      .select({ id: users.id, role: users.role, email: users.email })
      .from(users)
      .where(and(eq(users.id, validAssigneeId), eq(users.institutionId, actor.institutionId)))
      .limit(1)
    if (!assignee || (assignee.role !== 'redressal_officer' && assignee.role !== 'ombudsperson')) {
      return null
    }

    const [updated] = await tx
      .update(grievances)
      .set({ assignedToId: validAssigneeId, updatedAt: new Date() })
      .where(and(eq(grievances.id, grievanceId), eq(grievances.institutionId, actor.institutionId)))
      .returning()
    if (!updated) throw new Error('assignGrievance: update affected no row')

    await appendEvent(tx, actor.institutionId, grievanceId, {
      type: 'assigned',
      actorId: actor.id,
      actorRole: actor.role,
      remark: null,
      payload: { assigneeId: validAssigneeId },
      visibility: 'internal', // routing rationale, not the filer's business
    })

    // Tell the officer they now own a case with a clock on it. Not the student: who is
    // handling their grievance internally is routing detail, and it changes.
    const [inst] = await tx
      .select({ name: institutions.name })
      .from(institutions)
      .where(eq(institutions.id, actor.institutionId))
      .limit(1)

    if (inst) {
      const rendered = tpl.assigned(updated, inst)
      await enqueue(tx, {
        institutionId: actor.institutionId,
        recipientUserId: validAssigneeId,
        recipientEmail: assignee.email,
        kind: 'assigned',
        grievanceId: updated.id,
        subject: rendered.subject,
        body: rendered.body,
        dedupeKey: tpl.dedupeKeyFor('assigned', updated.id, validAssigneeId),
      })
    }

    return toActorView(actor, updated)
  })
}

export async function addRemark(
  actor: Actor,
  grievanceId: string,
  remark: string,
  visibility: 'public' | 'internal' = 'public',
): Promise<GrievanceEvent | null> {
  const validRemark = remarkSchema.parse(remark)
  const validVisibility = visibilitySchema.parse(visibility)
  // The visibility enum has no third state to silently fall into if this slips — an
  // internal note reaching a student is exactly the leak canViewInternalRemarks exists
  // to prevent on the read side, so the write side has to refuse it before it exists.
  if (validVisibility === 'internal' && !isStaff(actor.role)) {
    throw new Error('addRemark: only staff may add an internal remark')
  }

  return withTenant(actor.institutionId, async (tx) => {
    const grievance = await loadGrievance(tx, actor.institutionId, grievanceId)
    if (!grievance || !canComment(actor, grievance)) return null

    return appendEvent(tx, actor.institutionId, grievanceId, {
      type: 'remark_added',
      actorId: actor.id,
      actorRole: actor.role,
      remark: validRemark,
      payload: null,
      visibility: validVisibility,
    })
  })
}

export async function addAttachment(
  actor: Actor,
  grievanceId: string,
  file: AddAttachmentInput,
): Promise<Attachment | null> {
  const parsed = addAttachmentInputSchema.parse(file)

  return withTenant(actor.institutionId, async (tx) => {
    const grievance = await loadGrievance(tx, actor.institutionId, grievanceId)
    if (!grievance || !canComment(actor, grievance)) return null

    const [attachment] = await tx
      .insert(attachments)
      .values({
        institutionId: actor.institutionId,
        grievanceId,
        uploadedById: actor.id,
        storageKey: parsed.storageKey,
        fileName: parsed.fileName,
        contentType: parsed.contentType,
        byteSize: parsed.byteSize,
        sha256: parsed.sha256,
      })
      .returning()
    if (!attachment) throw new Error('addAttachment: insert returned no row')

    await appendEvent(tx, actor.institutionId, grievanceId, {
      type: 'attachment_added',
      actorId: actor.id,
      actorRole: actor.role,
      remark: null,
      payload: { attachmentId: attachment.id, fileName: attachment.fileName },
      visibility: 'public',
    })

    return attachment
  })
}

export async function fileAppeal(
  actor: Actor,
  grievanceId: string,
  input: FileAppealInput,
): Promise<FileAppealResult> {
  const parsed = fileAppealInputSchema.parse(input)

  try {
    return await withTenant(actor.institutionId, async (tx) => {
      const original = await loadGrievance(tx, actor.institutionId, grievanceId)
      if (!original) return { ok: false, reason: 'not-visible' }

      // Only the filing student may appeal (TRANSITION_ROLES.appealed = ['student']),
      // and only from a status the state machine allows it from — canSetStatus is the
      // single place both of those facts live.
      const denial = canSetStatus(actor, original, 'appealed')
      if (!denial.ok) return denial

      const [institution] = await tx
        .select()
        .from(institutions)
        .where(eq(institutions.id, actor.institutionId))
        .limit(1)
      if (!institution) throw new Error('fileAppeal: institution not found')

      const now = new Date()
      // The Ombudsperson window, not the original SLA or its category override — an
      // appeal is a different statutory clock (UGC 2023's separate appeal-window figure).
      // The Ombudsperson clause says 30 days without qualifying them as working days,
      // so this one stays on the calendar whatever the institution configures.
      const dueAt = computeDueAt(now, {
        institutionSlaDays: institution.slaOmbudspersonDays,
        mode: 'calendar',
      })
      const year = now.getUTCFullYear()
      const prefix = referencePrefix(institution.slug)

      const appeal = await withRetriedReference(tx, actor.institutionId, prefix, year, async (sp, reference) => {
        const [row] = await sp
          .insert(grievances)
          .values({
            institutionId: actor.institutionId,
            reference,
            submittedById: actor.id,
            isAnonymous: original.isAnonymous,
            categoryId: original.categoryId,
            kind: 'appeal',
            appealOfId: original.id,
            subject: parsed.subject ?? `Appeal: ${original.subject}`,
            body: parsed.body,
            status: 'submitted',
            dueAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        if (!row) throw new Error('fileAppeal: insert returned no row')
        return row
      })

      await appendEvent(tx, actor.institutionId, appeal.id, {
        type: 'submitted',
        actorId: actor.id,
        actorRole: actor.role,
        remark: null,
        payload: { appealOfId: original.id },
        visibility: 'public',
      })

      // CAS on the status just read, same as transitionStatus — but a lost race here
      // must roll back the appeal row and its event just inserted above, not merely
      // report a denial, or a committed transaction would leave an orphaned appeal
      // whose original was never actually moved to 'appealed'. Throwing is what forces
      // that rollback; the catch below turns it back into an ordinary TransitionResult.
      const [updatedOriginal] = await tx
        .update(grievances)
        .set({ status: 'appealed', updatedAt: now })
        .where(
          and(
            eq(grievances.id, original.id),
            eq(grievances.institutionId, actor.institutionId),
            eq(grievances.status, original.status),
          ),
        )
        .returning()
      if (!updatedOriginal) throw new ConcurrentTransitionError()

      await appendEvent(tx, actor.institutionId, original.id, {
        type: 'appealed',
        actorId: actor.id,
        actorRole: actor.role,
        remark: parsed.body,
        payload: { from: original.status, to: 'appealed', appealGrievanceId: appeal.id },
        visibility: 'public',
      })

      return {
        ok: true,
        original: toActorView(actor, updatedOriginal),
        appeal: toActorView(actor, appeal),
      }
    })
  } catch (err) {
    if (err instanceof ConcurrentTransitionError) return { ok: false, reason: 'illegal-transition' }
    throw err
  }
}

/** Bulk triage from the queue. Each id goes through the same canAssign/canSetStatus
 *  gate a single-item action would — a bulk op is not a second, looser code path, it's
 *  the same one called N times, so a row a caller isn't allowed to touch fails exactly
 *  the way it would one at a time. Capped at MAX_BULK_IDS so a pasted-in id list can't
 *  turn one click into an unbounded number of transactions. */
export async function bulkAssign(actor: Actor, grievanceIds: string[], assigneeId: string): Promise<BulkResult> {
  const ids = bulkIdsSchema.parse(grievanceIds)
  const succeeded: string[] = []
  const failed: Array<{ id: string; reason: string }> = []
  for (const id of ids) {
    const result = await assignGrievance(actor, id, assigneeId)
    if (result) succeeded.push(id)
    else failed.push({ id, reason: 'not-visible-or-not-assignable' })
  }
  return { succeeded, failed }
}

export async function bulkTransition(
  actor: Actor,
  grievanceIds: string[],
  to: Status,
  remark?: string,
): Promise<BulkResult> {
  const ids = bulkIdsSchema.parse(grievanceIds)
  const succeeded: string[] = []
  const failed: Array<{ id: string; reason: string }> = []
  for (const id of ids) {
    const result = await transitionStatus(actor, id, to, remark)
    if (result.ok) succeeded.push(id)
    else failed.push({ id, reason: result.reason })
  }
  return { succeeded, failed }
}

/** Filter-dropdown data for the queue page. */

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Queue a message to whoever filed a grievance, inside the caller's transaction.
 *
 * Silent for anonymous filings. The identity is retained for audit, but emailing it
 * would defeat the point of offering anonymity in the first place, and the student was
 * told plainly that the committee would not see who they are.
 */
async function notifyFiler(
  tx: Tx,
  actor: Actor,
  grievance: Grievance,
  kind: 'grievance_submitted' | 'status_changed',
  remark: string | null = null,
): Promise<void> {
  if (grievance.isAnonymous || !grievance.submittedById) return

  const [filer] = await tx
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.id, grievance.submittedById), eq(users.institutionId, actor.institutionId)))
    .limit(1)
  if (!filer) return

  const [institution] = await tx
    .select({ name: institutions.name })
    .from(institutions)
    .where(eq(institutions.id, actor.institutionId))
    .limit(1)
  if (!institution) return

  const rendered =
    kind === 'grievance_submitted'
      ? tpl.grievanceSubmitted(grievance, institution)
      : tpl.statusChanged(grievance, institution, remark)

  await enqueue(tx, {
    institutionId: actor.institutionId,
    recipientUserId: grievance.submittedById,
    recipientEmail: filer.email,
    kind,
    grievanceId: grievance.id,
    subject: rendered.subject,
    body: rendered.body,
    // A status change can legitimately repeat (resolved, reopened, resolved), so the
    // status itself is part of the key rather than just the grievance.
    dedupeKey:
      kind === 'grievance_submitted'
        ? tpl.dedupeKeyFor(kind, grievance.id)
        : tpl.dedupeKeyFor(kind, grievance.id, `${grievance.status}:${grievance.updatedAt.getTime()}`),
  })
}
