/**
 * Every read path for a grievance: a student's own list, the officer queue, case detail,
 * the compliance snapshot, and the public reference lookup.
 *
 * Reads never mutate and never append events. Split from `commands.ts` because the two
 * halves change for different reasons: commands change when the workflow changes,
 * queries change when a screen needs a different shape.
 */
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { withTenant } from '@/db/client'
import {
  attachments,
  categories,
  grievanceEvents,
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
import {
  canSetStatus,
  canView,
  canViewInternalRemarks,
  isStaff,
  type Actor,
} from './policy'
import { slaState } from './sla'
import { buildComplianceStats, type ComplianceStats } from './compliance'
import {
  ListGrievancesFilters,
  ListGrievancesResult,
  OPEN_STATUSES,
  QueueFilters,
  TransitionResult,
  appendEvent,
  listFiltersSchema,
  loadGrievance,
  queueFiltersSchema,
  ratingSchema,
  remarkSchema,
  roleScopeCondition,
  toActorView,
  uuidSchema,
} from './_internal'
import { clusterGrievances } from '@/lib/ai/clusters'

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

// ---------------------------------------------------------------------------
// Systemic patterns
// ---------------------------------------------------------------------------

export interface PatternGroup {
  grievanceIds: string[]
  references: string[]
  subject: string
  terms: string[]
  cohesion: number
  categoryName: string | null
  oldestDaysOpen: number
}

/**
 * Find the open grievances that are really one grievance.
 *
 * Forty students reporting the same mess problem show up as forty closures and a healthy
 * median, and the sentence that matters ("the mess has a problem") never gets written.
 * This is the query that writes it.
 *
 * Bounded to open cases from the last 90 days: a systemic problem worth surfacing is a
 * live one, and clustering the entire history would find last year's resolved issues and
 * present them as news.
 */
export async function detectPatterns(actor: Actor, limit = 5): Promise<PatternGroup[]> {
  if (!isStaff(actor.role)) return []

  const since = new Date(Date.now() - 90 * 86_400_000)

  return withTenant(actor.institutionId, async (tx) => {
    const rows = await tx
      .select({
        id: grievances.id,
        reference: grievances.reference,
        subject: grievances.subject,
        body: grievances.body,
        categoryId: grievances.categoryId,
        createdAt: grievances.createdAt,
        categoryName: categories.name,
      })
      .from(grievances)
      .leftJoin(categories, eq(categories.id, grievances.categoryId))
      .where(
        and(
          eq(grievances.institutionId, actor.institutionId),
          gte(grievances.createdAt, since),
          sql`${grievances.status} NOT IN ('closed','rejected','withdrawn')`,
        ),
      )

    const byId = new Map(rows.map((r) => [r.id, r]))
    const clusters = clusterGrievances(
      rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        body: r.body,
        categoryId: r.categoryId,
        createdAt: r.createdAt,
      })),
    )

    const now = Date.now()
    return clusters.slice(0, limit).map((c) => {
      const members = c.members.map((id) => byId.get(id)!).filter(Boolean)
      const oldest = members.reduce(
        (acc, m) => Math.min(acc, m.createdAt.getTime()),
        now,
      )
      return {
        grievanceIds: c.members,
        references: members.map((m) => m.reference),
        // The most recent member's subject reads as the group's headline better than any
        // summary built out of the shared terms.
        subject: members[0]?.subject ?? '',
        terms: c.terms,
        cohesion: c.cohesion,
        categoryName: c.categoryId ? (members[0]?.categoryName ?? null) : null,
        oldestDaysOpen: Math.floor((now - oldest) / 86_400_000),
      }
    })
  })
}
