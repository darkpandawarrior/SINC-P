/**
 * Shared guts of the grievance service: input schemas, result types, and the two
 * helpers every command and query needs.
 *
 * Everything here is exported so `commands.ts` and `queries.ts` can reach it, but it is
 * not part of the public surface. Call sites import from `./service`, which re-exports
 * only the operations. The underscore prefix is the reminder.
 */
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { type Tx } from '@/db/client'
import {
  grievanceEvents,
  grievanceStatus,
  grievances,
  type Grievance,
  type GrievanceEvent,
} from '@/db/schema'
import { nextEvent } from './audit'
import {
  isOpen,
  isStaff,
  type Actor,
  type Role,
  type Status,
  type TransitionDenial,
} from './policy'
import { isUniqueViolation } from './reference'

export const STATUS_VALUES = grievanceStatus.enumValues as [Status, ...Status[]]
export const OPEN_STATUSES = STATUS_VALUES.filter(isOpen)

export const uuidSchema = z.uuid()
/**
 * Remarks reject control characters.
 *
 * The audit chain joins its fields with U+001F. A remark containing a literal U+001F
 * could therefore make two different logical events serialise to the same bytes. No
 * exploitable path exists today (verifyChain always recomputes from the row it is
 * checking, and the database trigger blocks swapping a row for a colliding one), but a
 * delimiter that a user can type is a sharp edge pointed at the one guarantee this
 * product sells. Refuse it at the boundary instead of relying on downstream luck.
 *
 * \n, \r and \t are allowed: people paste multi-line evidence into these boxes.
 */
export const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/

export const remarkSchema = z
  .string()
  .trim()
  .min(1)
  .max(4000)
  .refine((v) => !CONTROL_CHARS.test(v), {
    message: 'Remark contains control characters that are not allowed.',
  })
export const visibilitySchema = z.enum(['public', 'internal'])
export const toStatusSchema = z.enum(STATUS_VALUES)
export const ratingSchema = z.number().int().min(1).max(5)

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

export const listFiltersSchema = z.object({
  status: z.array(toStatusSchema).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})
export type ListGrievancesFilters = z.input<typeof listFiltersSchema>

export interface ListGrievancesResult {
  items: Grievance[]
  total: number
}

export const queueFiltersSchema = z.object({
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

export const MAX_BULK_IDS = 50
export const bulkIdsSchema = z.array(uuidSchema).min(1).max(MAX_BULK_IDS)

export interface BulkResult {
  succeeded: string[]
  failed: Array<{ id: string; reason: string }>
}

export type DenialReason = Extract<TransitionDenial, { ok: false }>['reason']

export type TransitionResult = { ok: true; grievance: Grievance } | { ok: false; reason: DenialReason }

/**
 * Thrown only inside a transaction that already wrote something before discovering a
 * lost status-change race, so the caller needs the whole transaction rolled back rather
 * than a value returned — see fileAppeal's second update for the one place this applies.
 */
export class ConcurrentTransitionError extends Error {}

export type FileAppealResult =
  | { ok: true; original: Grievance; appeal: Grievance }
  | { ok: false; reason: DenialReason }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export async function loadGrievance(tx: Tx, institutionId: string, grievanceId: string): Promise<Grievance | null> {
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
export function toActorView(actor: Actor, grievance: Grievance): Grievance {
  if (grievance.isAnonymous && isStaff(actor.role)) {
    return { ...grievance, submittedById: null }
  }
  return grievance
}

export interface EventDraft {
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
export const MAX_EVENT_ATTEMPTS = 16

/**
 * Append one link to a grievance's hash chain. Reads the previous event and writes the
 * next one inside a savepoint, so a `(grievance_id, seq)` collision from a concurrent
 * writer on the same grievance only unwinds this append and retries with a fresh read —
 * it does not lose the grievance-row change every caller here does in the same outer
 * transaction just before calling this.
 */
export async function appendEvent(
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
export function roleScopeCondition(actor: Actor) {
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

