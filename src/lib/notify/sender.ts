/**
 * Drains the outbox.
 *
 * Called from `scripts/send-notifications.ts` (cron, or a systemd timer on the
 * college's own box) and from the admin console's "retry now" button. Deliberately not
 * called from a request path: a student pressing submit should never wait on a mail
 * server, and a mail server being down should never fail a grievance.
 */
import { claimBatch, markFailed, markSent, MAX_ATTEMPTS } from './outbox'
import { getTransport } from './transport'

export interface SweepResult {
  claimed: number
  sent: number
  failed: number
  deadLettered: number
}

export async function sweep(limit = 50): Promise<SweepResult> {
  const batch = await claimBatch(limit)
  const result: SweepResult = { claimed: batch.length, sent: 0, failed: 0, deadLettered: 0 }
  if (batch.length === 0) return result

  const transport = getTransport()

  // Sequential on purpose. A college relay will rate-limit or greylist a burst, and
  // fifty messages one after another is still under a second of real work.
  for (const row of batch) {
    try {
      await transport.send({ to: row.recipientEmail, subject: row.subject, body: row.body })
      await markSent(row.id)
      result.sent += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await markFailed(row.id, message)
      result.failed += 1
      // attempts was incremented by markFailed, so this row has now used up its budget.
      if (row.attempts + 1 >= MAX_ATTEMPTS) result.deadLettered += 1
    }
  }

  return result
}
