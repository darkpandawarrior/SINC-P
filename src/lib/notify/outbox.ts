/**
 * The notification outbox.
 *
 * `enqueue` takes the transaction that caused the message, on purpose. A grievance
 * moving to `resolved` and the student being told about it are the same fact, so they
 * commit or roll back together. Delivery happens later, out of band, which keeps SMTP
 * latency and SMTP failure out of the request path entirely.
 *
 * Delivery is at-least-once, not exactly-once. A process that dies between sending and
 * marking sent will send again on the next sweep. Pass a `dedupeKey` for anything a
 * repeated sweep could duplicate (an SLA breach warning is the obvious one) and the
 * unique index turns the second attempt into a no-op.
 */
import { and, asc, eq, lt, or, sql } from 'drizzle-orm'
import { withTenant, withoutTenantScope, type Tx } from '@/db/client'
import { notifications, type Notification } from '@/db/schema'

export type NotificationKind =
  | 'grievance_submitted'
  | 'status_changed'
  | 'assigned'
  | 'sla_breached'
  | 'appeal_filed'

export interface EnqueueInput {
  institutionId: string
  recipientEmail: string
  recipientUserId?: string | null
  kind: NotificationKind
  grievanceId?: string | null
  subject: string
  body: string
  /** Unique per institution. Makes a repeated enqueue idempotent. */
  dedupeKey?: string | null
}

/**
 * Queue a message inside an existing transaction.
 *
 * `onConflictDoNothing` is the whole idempotency story: a second enqueue with the same
 * dedupeKey silently does nothing rather than raising and rolling back the caller's
 * transaction, which would be a spectacular own goal (a duplicate email attempt undoing
 * a legitimate status change).
 */
export async function enqueue(tx: Tx, input: EnqueueInput): Promise<void> {
  await tx
    .insert(notifications)
    .values({
      institutionId: input.institutionId,
      recipientUserId: input.recipientUserId ?? null,
      recipientEmail: input.recipientEmail.toLowerCase(),
      kind: input.kind,
      grievanceId: input.grievanceId ?? null,
      subject: input.subject,
      body: input.body,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing()
}

/** Convenience for callers that are not already inside a transaction. */
export async function enqueueStandalone(input: EnqueueInput): Promise<void> {
  await withTenant(input.institutionId, (tx) => enqueue(tx, input))
}

export const MAX_ATTEMPTS = 5

/**
 * Claim a batch of pending messages across every institution.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes two senders running at once safe: each grabs a
 * disjoint set instead of blocking on the other or, worse, both sending the same row.
 * Cross-tenant by necessity, since the sender is a platform job rather than a request.
 */
export async function claimBatch(limit = 50): Promise<Notification[]> {
  return withoutTenantScope('the sender is a platform job, not a tenant request', async (tx) => {
    const rows = await tx
      .select()
      .from(notifications)
      .where(
        and(
          or(eq(notifications.status, 'pending'), eq(notifications.status, 'failed')),
          lt(notifications.attempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(asc(notifications.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true })
    return rows
  })
}

export async function markSent(id: string): Promise<void> {
  await withoutTenantScope('sender bookkeeping', (tx) =>
    tx
      .update(notifications)
      .set({ status: 'sent', sentAt: new Date(), lastError: null })
      .where(eq(notifications.id, id)),
  )
}

export async function markFailed(id: string, error: string): Promise<void> {
  await withoutTenantScope('sender bookkeeping', (tx) =>
    tx
      .update(notifications)
      .set({
        status: 'failed',
        attempts: sql`${notifications.attempts} + 1`,
        // Truncated: a provider that returns an HTML error page should not become a
        // multi-megabyte row.
        lastError: error.slice(0, 2000),
      })
      .where(eq(notifications.id, id)),
  )
}

export interface OutboxStats {
  pending: number
  failed: number
  sent: number
  deadLettered: number
}

/** For the admin console, so a silent delivery outage is visible rather than inferred. */
export async function outboxStats(institutionId: string): Promise<OutboxStats> {
  return withTenant(institutionId, async (tx) => {
    const rows = await tx
      .select({
        status: notifications.status,
        attempts: notifications.attempts,
        n: sql<number>`count(*)::int`,
      })
      .from(notifications)
      .where(eq(notifications.institutionId, institutionId))
      .groupBy(notifications.status, notifications.attempts)

    const stats: OutboxStats = { pending: 0, failed: 0, sent: 0, deadLettered: 0 }
    for (const r of rows) {
      if (r.status === 'sent') stats.sent += r.n
      else if (r.status === 'pending') stats.pending += r.n
      else if (r.attempts >= MAX_ATTEMPTS) stats.deadLettered += r.n
      else stats.failed += r.n
    }
    return stats
  })
}
