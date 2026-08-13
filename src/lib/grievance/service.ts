/**
 * The transactional heart of the grievance system. Every mutation below writes its
 * state change and its audit event inside the SAME transaction — if the event write
 * fails, the whole thing rolls back, state change included. That atomicity is the
 * entire compliance claim: a grievance can never end up in a status the trail doesn't
 * also explain.
 *
 * Every read and every status change is gated by canView/canSetStatus from policy.ts.
 * Nothing here re-implements those checks; it only calls them.
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant, type Tx } from '@/db/client'
import {
  attachments,
  categories,
  grievanceEvents,
  grievanceStatus,
  grievances,
  handbookEntries,
  institutions,
  users,
  type Attachment,
  type Category,
  type Grievance,
  type GrievanceEvent,
  type HandbookEntry,
  type Institution,
  type User,
} from '@/db/schema'
import { nextEvent } from './audit'
import {
  canAssign,
  canComment,
  canSetStatus,
  canView,
  canViewInternalRemarks,
  isOpen,
  isStaff,
  type Actor,
  type Role,
  type Status,
  type TransitionDenial,
} from './policy'
import { isUniqueViolation, referencePrefix, withRetriedReference } from './reference'
import { computeDueAt, slaState } from './sla'
import { buildComplianceStats, type ComplianceStats } from './compliance'

const STATUS_VALUES = grievanceStatus.enumValues as [Status, ...Status[]]
const OPEN_STATUSES = STATUS_VALUES.filter(isOpen)

const uuidSchema = z.uuid()
const remarkSchema = z.string().trim().min(1).max(4000)
const visibilitySchema = z.enum(['public', 'internal'])
const toStatusSchema = z.enum(STATUS_VALUES)
const ratingSchema = z.number().int().min(1).max(5)

export const submitGrievanceInputSchema = z.object({
  categoryId: uuidSchema,
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(8000),
  kind: z.enum(['grievance', 'suggestion']).default('grievance'),
  isAnonymous: z.boolean().default(false),
})
export type SubmitGrievanceInput = z.input<typeof submitGrievanceInputSchema>

export const fileAppealInputSchema = z.object({
  subject: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().min(10).max(8000),
})
export type FileAppealInput = z.input<typeof fileAppealInputSchema>

export const addAttachmentInputSchema = z.object({
  storageKey: z.string().min(1).max(255),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().min(1).max(127),
  byteSize: z.number().int().positive(),
  sha256: z.string().length(64),
})
export type AddAttachmentInput = z.input<typeof addAttachmentInputSchema>

const listFiltersSchema = z.object({
  status: z.array(toStatusSchema).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})
export type ListGrievancesFilters = z.input<typeof listFiltersSchema>

export interface ListGrievancesResult {
  items: Grievance[]
  total: number
}

const queueFiltersSchema = z.object({
  status: z.array(toStatusSchema).optional(),
  categoryId: uuidSchema.optional(),
  // 'me' resolves against the calling actor, so a bookmarked officer-console URL is
  // never institution-specific and never leaks another user's id into a query string.
  assignee: z.union([uuidSchema, z.literal('unassigned'), z.literal('me')]).optional(),
  slaState: z.enum(['on_track', 'due_soon', 'breached']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})
export type QueueFilters = z.input<typeof queueFiltersSchema>

const MAX_BULK_IDS = 50
const bulkIdsSchema = z.array(uuidSchema).min(1).max(MAX_BULK_IDS)

export interface BulkResult {
  succeeded: string[]
  failed: Array<{ id: string; reason: string }>
}

type DenialReason = Extract<TransitionDenial, { ok: false }>['reason']

export type TransitionResult = { ok: true; grievance: Grievance } | { ok: false; reason: DenialReason }

/**
 * Thrown only inside a transaction that already wrote something before discovering a
 * lost status-change race, so the caller needs the whole transaction rolled back rather
 * than a value returned — see fileAppeal's second update for the one place this applies.
 */
class ConcurrentTransitionError extends Error {}

export type FileAppealResult =
  | { ok: true; original: Grievance; appeal: Grievance }
  | { ok: false; reason: DenialReason }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function loadGrievance(tx: Tx, institutionId: string, grievanceId: string): Promise<Grievance | null> {
  const rows = await tx
    .select()
    .from(grievances)
    .where(and(eq(grievances.id, grievanceId), eq(grievances.institutionId, institutionId)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Anonymous filing hides the identity from staff, never from the student themself and
 * never from the stored row — the real submittedById stays in the database forever,
 * because audit needs it. Only the object handed back across this module's boundary is
 * masked, and only for a staff viewer.
 */
function toActorView(actor: Actor, grievance: Grievance): Grievance {
  if (grievance.isAnonymous && isStaff(actor.role)) {
    return { ...grievance, submittedById: null }
  }
  return grievance
}

interface EventDraft {
  type: GrievanceEvent['type']
  actorId: string | null
  actorRole: Role | null
  remark: string | null
  payload: Record<string, unknown> | null
  visibility: GrievanceEvent['visibility']
}

// N concurrent appenders on the SAME grievance resolve like an elimination bracket:
// Postgres blocks every insert but one on the conflicting (grievance_id, seq) row,
// releases them all at once when the winner commits, and every loser then retries —
// so the least-lucky caller among N needs up to N-1 retries, not O(1). Verified
// against real 8-way contention in service.test.ts, not assumed. A handful of staff
// piling remarks onto one grievance in the same instant is the realistic ceiling this
// covers; raise it if a bulk/automated writer ever appends to one grievance at scale.
const MAX_EVENT_ATTEMPTS = 16

/**
 * Append one link to a grievance's hash chain. Reads the previous event and writes the
 * next one inside a savepoint, so a `(grievance_id, seq)` collision from a concurrent
 * writer on the same grievance only unwinds this append and retries with a fresh read —
 * it does not lose the grievance-row change every caller here does in the same outer
 * transaction just before calling this.
 */
async function appendEvent(
  tx: Tx,
  institutionId: string,
  grievanceId: string,
  draft: EventDraft,
): Promise<GrievanceEvent> {
  for (let attempt = 0; attempt < MAX_EVENT_ATTEMPTS; attempt++) {
    try {
      return await tx.transaction(async (sp) => {
        const [previous] = await sp
          .select({ seq: grievanceEvents.seq, hash: grievanceEvents.hash })
          .from(grievanceEvents)
          .where(eq(grievanceEvents.grievanceId, grievanceId))
          .orderBy(desc(grievanceEvents.seq))
          .limit(1)

        const built = nextEvent(previous ?? null, {
          grievanceId,
          type: draft.type,
          actorId: draft.actorId,
          remark: draft.remark,
          payload: draft.payload,
          createdAt: new Date(),
        })

        const [row] = await sp
          .insert(grievanceEvents)
          .values({
            institutionId,
            grievanceId,
            seq: built.seq,
            // draft.type carries the literal event_type union; nextEvent's own `type`
            // field is widened to `string` (audit.ts is generic over event shape), so
            // the narrow type comes from the caller, not the built chain link.
            type: draft.type,
            actorId: draft.actorId,
            actorRole: draft.actorRole,
            remark: built.remark,
            visibility: draft.visibility,
            payload: built.payload,
            prevHash: built.prevHash,
            hash: built.hash,
            createdAt: built.createdAt,
          })
          .returning()
        if (!row) throw new Error('appendEvent: insert returned no row')
        return row
      })
    } catch (err) {
      if (isUniqueViolation(err) && attempt < MAX_EVENT_ATTEMPTS - 1) continue
      throw err
    }
  }
  throw new Error('appendEvent: exhausted retries')
}

/**
 * SQL mirror of canView's per-role branch, needed because the list query has to filter
 * rows in the WHERE clause before any Grievance object exists to hand the real
 * function. Keep this in sync with canView in policy.ts if that ever changes shape.
 */
function roleScopeCondition(actor: Actor) {
  switch (actor.role) {
    case 'student':
      return eq(grievances.submittedById, actor.id)
    case 'moderator':
    case 'institution_admin':
      return undefined // no extra restriction beyond institution
    case 'redressal_officer':
      return or(eq(grievances.assignedToId, actor.id), isNull(grievances.assignedToId))
    case 'ombudsperson':
      return or(
        eq(grievances.status, 'appealed'),
        isNotNull(grievances.appealOfId),
        eq(grievances.assignedToId, actor.id),
      )
    default:
      return sql`false`
  }
}

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
    const dueAt = computeDueAt(now, {
      institutionSlaDays: institution.slaResolutionDays,
      categorySlaDays: category.slaResolutionDays,
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
      .select({ id: users.id, role: users.role })
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
      const dueAt = computeDueAt(now, { institutionSlaDays: institution.slaOmbudspersonDays })
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The only read path for a single grievance. Returns null both when the id doesn't
 * exist and when it exists but canView refuses it — an attacker probing ids must not
 * be able to tell the two apart.
 */
export async function getGrievanceForActor(actor: Actor, grievanceId: string): Promise<Grievance | null> {
  if (!uuidSchema.safeParse(grievanceId).success) return null

  return withTenant(actor.institutionId, async (tx) => {
    const grievance = await loadGrievance(tx, actor.institutionId, grievanceId)
    if (!grievance || !canView(actor, grievance)) return null
    return toActorView(actor, grievance)
  })
}

/** Role-aware, paginated, and filtered only on indexed columns (institution_id+status
 *  via grievances_institution_status_idx, institution_id+submittedById via
 *  grievances_submitter_idx). */
export async function listGrievances(
  actor: Actor,
  filters: ListGrievancesFilters = {},
): Promise<ListGrievancesResult> {
  const { status, page, pageSize } = listFiltersSchema.parse(filters)

  return withTenant(actor.institutionId, async (tx) => {
    const scope = roleScopeCondition(actor)
    const conditions = [eq(grievances.institutionId, actor.institutionId)]
    if (scope) conditions.push(scope)
    if (status && status.length > 0) conditions.push(inArray(grievances.status, status))
    const where = and(...conditions)

    const [items, totalRows] = await Promise.all([
      tx
        .select()
        .from(grievances)
        .where(where)
        .orderBy(desc(grievances.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      tx.select({ n: count() }).from(grievances).where(where),
    ])

    return { items: items.map((g) => toActorView(actor, g)), total: totalRows[0]?.n ?? 0 }
  })
}

// ---------------------------------------------------------------------------
// Officer console — queue, bulk triage, case detail, compliance
// ---------------------------------------------------------------------------

// ponytail: rows are fetched sorted by due date and SLA-state filtering happens in
// JS below, because slaState is derived from `now` and isn't a stored/indexed column.
// Fine at the scale this ships at — one institution's open queue, not a firehose.
// Upgrade to a computed column (or a materialized "is_breached" flag refreshed on a
// cron) if a tenant's open queue ever runs into the thousands.
const QUEUE_SCAN_CAP = 1000

/**
 * The queue: what breaches soonest, not newest. Defaults to open statuses only — a
 * "queue" that includes closed grievances by default is a list, not a queue, and
 * buries the thing the Registrar actually needs to act on today.
 */
export async function listQueue(actor: Actor, filters: QueueFilters = {}): Promise<ListGrievancesResult> {
  const { status, categoryId, assignee, slaState: slaFilter, page, pageSize } = queueFiltersSchema.parse(filters)

  return withTenant(actor.institutionId, async (tx) => {
    const scope = roleScopeCondition(actor)
    const conditions = [eq(grievances.institutionId, actor.institutionId)]
    if (scope) conditions.push(scope)
    conditions.push(inArray(grievances.status, status && status.length > 0 ? status : OPEN_STATUSES))
    if (categoryId) conditions.push(eq(grievances.categoryId, categoryId))
    if (assignee === 'unassigned') conditions.push(isNull(grievances.assignedToId))
    else if (assignee === 'me') conditions.push(eq(grievances.assignedToId, actor.id))
    else if (assignee) conditions.push(eq(grievances.assignedToId, assignee))

    // Postgres' default NULLS LAST on ASC keeps grievances with no due date (a rare
    // pre-submit edge case) from crowding out the ones actually about to breach.
    const rows = await tx
      .select()
      .from(grievances)
      .where(and(...conditions))
      .orderBy(asc(grievances.dueAt))
      .limit(QUEUE_SCAN_CAP)

    const now = new Date()
    const withState = rows.map((g) => ({ g, state: slaState(g, now) }))
    const filtered = slaFilter ? withState.filter((x) => x.state === slaFilter) : withState

    const start = (page - 1) * pageSize
    const items = filtered.slice(start, start + pageSize).map((x) => toActorView(actor, x.g))
    return { items, total: filtered.length }
  })
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
export async function listCategories(actor: Actor): Promise<Category[]> {
  return withTenant(actor.institutionId, (tx) =>
    tx
      .select()
      .from(categories)
      .where(and(eq(categories.institutionId, actor.institutionId), eq(categories.isActive, true)))
      .orderBy(categories.sortOrder),
  )
}

/** The two roles a grievance can actually be assigned to (see assignGrievance) — the
 *  same list every "Assign to..." dropdown needs, single/bulk alike. */
export async function listAssignableStaff(actor: Actor): Promise<Array<Pick<User, 'id' | 'fullName' | 'role'>>> {
  return withTenant(actor.institutionId, (tx) =>
    tx
      .select({ id: users.id, fullName: users.fullName, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.institutionId, actor.institutionId),
          eq(users.isActive, true),
          inArray(users.role, ['redressal_officer', 'ombudsperson']),
        ),
      )
      .orderBy(users.fullName),
  )
}

export interface GrievanceDetail {
  grievance: Grievance
  categoryName: string | null
  submittedByName: string | null
  assignedToName: string | null
  events: Array<GrievanceEvent & { actorName: string | null }>
  attachments: Attachment[]
}

/**
 * Everything the case view needs in one call: the grievance, its full trail (internal
 * remarks filtered out for a non-staff viewer — dead code for this staff-only vertical
 * today, kept because canViewInternalRemarks is the one place that decision is allowed
 * to live), its attachments, and the human names the trail would otherwise only have
 * ids for.
 */
export async function getGrievanceDetail(actor: Actor, grievanceId: string): Promise<GrievanceDetail | null> {
  if (!uuidSchema.safeParse(grievanceId).success) return null

  return withTenant(actor.institutionId, async (tx) => {
    const grievance = await loadGrievance(tx, actor.institutionId, grievanceId)
    if (!grievance || !canView(actor, grievance)) return null

    const actorView = toActorView(actor, grievance)

    // Sequential, not Promise.all: these all run on the one connection this
    // transaction holds. node-postgres queues concurrent queries on a single client
    // today (with a deprecation warning — verified live, not assumed) rather than
    // running them in parallel, so Promise.all here buys nothing but a future break.
    const categoryRows = grievance.categoryId
      ? await tx.select({ name: categories.name }).from(categories).where(eq(categories.id, grievance.categoryId)).limit(1)
      : []
    const submitterRows = actorView.submittedById
      ? await tx.select({ name: users.fullName }).from(users).where(eq(users.id, actorView.submittedById)).limit(1)
      : []
    const assigneeRows = grievance.assignedToId
      ? await tx.select({ name: users.fullName }).from(users).where(eq(users.id, grievance.assignedToId)).limit(1)
      : []
    const events = await tx
      .select()
      .from(grievanceEvents)
      .where(eq(grievanceEvents.grievanceId, grievanceId))
      .orderBy(grievanceEvents.seq)
    const attachmentRows = await tx
      .select()
      .from(attachments)
      .where(eq(attachments.grievanceId, grievanceId))
      .orderBy(attachments.createdAt)

    const visibleEvents = canViewInternalRemarks(actor, grievance)
      ? events
      : events.filter((e) => e.visibility === 'public')

    // The same masking toActorView applies to the grievance row must also apply to the
    // trail: the 'submitted' event's actorId is the real student id (submitGrievance
    // never anonymises the write, only the read), so resolving it into a name here
    // would hand a staff viewer exactly the identity isAnonymous exists to withhold.
    const hideSubmitterIdentity = grievance.isAnonymous && isStaff(actor.role)
    const actorIds = [
      ...new Set(
        visibleEvents
          .map((e) => e.actorId)
          .filter((id): id is string => id !== null && !(hideSubmitterIdentity && id === grievance.submittedById)),
      ),
    ]
    const actorNameRows = actorIds.length
      ? await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, actorIds))
      : []
    const nameById = new Map(actorNameRows.map((a) => [a.id, a.name]))

    return {
      grievance: actorView,
      categoryName: categoryRows[0]?.name ?? null,
      submittedByName: submitterRows[0]?.name ?? null,
      assignedToName: assigneeRows[0]?.name ?? null,
      events: visibleEvents.map((e) => ({ ...e, actorName: e.actorId ? (nameById.get(e.actorId) ?? null) : null })),
      attachments: attachmentRows,
    }
  })
}

/**
 * The compliance dashboard's data. Institution-wide by design — unlike listQueue this
 * ignores roleScopeCondition, because "median resolution time this cycle" must not
 * change depending on which officer happens to be logged in. Restricted to the two
 * roles that already see the whole institution unfiltered in canView (moderator,
 * institution_admin), so that isn't actually a widening of what the viewer could see.
 *
 * ponytail: the default cycle is the current calendar year in UTC, not an academic
 * year and not IST-boundary-exact. Good enough for a default report window — unlike
 * sla.ts's due-date math, being off by a few hours at the boundary doesn't change
 * which grievances get counted as breached, only which cycle a borderline one lands
 * in. Upgrade if a customer's NAAC cycle needs an exact configured start date.
 */
export async function complianceSnapshot(
  actor: Actor,
  opts: { since?: Date; until?: Date } = {},
): Promise<ComplianceStats | null> {
  if (actor.role !== 'institution_admin' && actor.role !== 'moderator') return null

  const until = opts.until ?? new Date()
  const since = opts.since ?? new Date(Date.UTC(until.getUTCFullYear(), 0, 1))

  return withTenant(actor.institutionId, async (tx) => {
    // Sequential: one connection, one query in flight — see getGrievanceDetail's note.
    const rows = await tx
      .select()
      .from(grievances)
      .where(
        and(
          eq(grievances.institutionId, actor.institutionId),
          gte(grievances.createdAt, since),
          lte(grievances.createdAt, until),
        ),
      )
    const categoryRows = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.institutionId, actor.institutionId))

    return buildComplianceStats(rows, categoryRows, since, until, new Date())
  })
}

// ---------------------------------------------------------------------------
// Student portal — filing, deflection, and the student-facing trail
// ---------------------------------------------------------------------------

/**
 * The student-facing lookup: students and the acknowledgement receipt both key off the
 * human reference ("MANIT-2026-00042"), never the uuid. Same anti-enumeration shape as
 * getGrievanceForActor — a wrong reference and someone else's reference both come back
 * null, so probing can't tell "doesn't exist" from "not yours".
 */
export async function getGrievanceByReference(actor: Actor, reference: string): Promise<Grievance | null> {
  const trimmed = reference.trim()
  if (!trimmed) return null

  return withTenant(actor.institutionId, async (tx) => {
    const [grievance] = await tx
      .select()
      .from(grievances)
      .where(and(eq(grievances.reference, trimmed), eq(grievances.institutionId, actor.institutionId)))
      .limit(1)
    if (!grievance || !canView(actor, grievance)) return null
    return toActorView(actor, grievance)
  })
}

/** The institution row for the current tenant — SLA/appeal-window config and the
 *  anonymous-filing flag the filing form needs before it decides what to render. */
export async function getInstitution(actor: Pick<Actor, 'institutionId'>): Promise<Institution | null> {
  return withTenant(actor.institutionId, async (tx) => {
    const [row] = await tx.select().from(institutions).where(eq(institutions.id, actor.institutionId)).limit(1)
    return row ?? null
  })
}

const HANDBOOK_MATCH_LIMIT = 5

/**
 * Deflection: published handbook entries tied to the category a student just picked.
 * Matched on categoryId alone, not full-text search — a student has already narrowed
 * their problem to a category by the time this runs, and that's a stronger signal than
 * anything a keyword match over subject/body would add for a five-entry list.
 */
export async function listHandbookForCategory(
  actor: Pick<Actor, 'institutionId'>,
  categoryId: string,
): Promise<HandbookEntry[]> {
  const validId = uuidSchema.safeParse(categoryId)
  if (!validId.success) return []

  return withTenant(actor.institutionId, (tx) =>
    tx
      .select()
      .from(handbookEntries)
      .where(
        and(
          eq(handbookEntries.institutionId, actor.institutionId),
          eq(handbookEntries.categoryId, validId.data),
          eq(handbookEntries.isPublished, true),
        ),
      )
      .limit(HANDBOOK_MATCH_LIMIT),
  )
}

/**
 * Accepting a resolution and rating it are the same click in the UI, so they're the
 * same write here: one status_changed event, not a transition plus a silent column
 * patch that never made it into the trail. Rating is optional — a student who just
 * wants the grievance closed isn't blocked on rating it.
 */
export async function closeGrievance(
  actor: Actor,
  grievanceId: string,
  opts: { satisfactionRating?: number; remark?: string } = {},
): Promise<TransitionResult> {
  const rating = opts.satisfactionRating === undefined ? undefined : ratingSchema.parse(opts.satisfactionRating)
  const validRemark = opts.remark === undefined ? undefined : remarkSchema.parse(opts.remark)

  return withTenant(actor.institutionId, async (tx) => {
    const grievance = await loadGrievance(tx, actor.institutionId, grievanceId)
    if (!grievance) return { ok: false, reason: 'not-visible' }

    const denial = canSetStatus(actor, grievance, 'closed')
    if (!denial.ok) return denial

    const now = new Date()
    const patch: Partial<typeof grievances.$inferInsert> = { status: 'closed', updatedAt: now, closedAt: now }
    if (rating !== undefined) patch.satisfactionRating = rating

    // CAS on the status just read — see transitionStatus for why. Nothing precedes
    // this write in the transaction, so a lost race is just reported, not rolled back.
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
      payload: {
        from: grievance.status,
        to: 'closed',
        ...(rating !== undefined ? { satisfactionRating: rating } : {}),
      },
      visibility: 'public',
    })

    return { ok: true, grievance: toActorView(actor, updated) }
  })
}
