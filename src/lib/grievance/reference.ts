/**
 * Human-facing grievance references — "MANIT-2026-00042". Students read these out on
 * the phone and quote them in person, so a UUID is unusable, and a per-institution
 * database sequence would need a schema object this vertical doesn't own
 * (src/db/schema.ts is fixed).
 *
 * The number is derived, not stored: count existing references for
 * (institution, prefix, year) and format the next one. The `(institution_id,
 * reference)` unique index is the actual arbiter of correctness, not the count. Two
 * concurrent submissions that count the same value both attempt the same INSERT;
 * Postgres blocks the second on the first's row until the first transaction resolves
 * (standard unique-index insert behaviour, no application locking involved). The loser
 * then sees a real unique-violation against a row that is now committed, retries with a
 * fresh count, and gets the next number. A transaction that never commits — crash,
 * validation failure, anything — never occupied a number to begin with, so this scheme
 * cannot leave a gap; it can only retry or fail outright.
 */
import { and, count, eq, like } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { grievances } from '@/db/schema'

// Same elimination-bracket shape as appendEvent's retry in service.ts: N concurrent
// submitters racing for the same institution/year window resolve one at a time, so the
// least-lucky caller needs up to N-1 retries. Generous on purpose — see service.ts's
// MAX_EVENT_ATTEMPTS comment for the measured reasoning.
const MAX_ATTEMPTS = 16
/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = '23505'

/**
 * drizzle-node-postgres never throws the raw `pg` error — every query error is wrapped
 * in a `DrizzleQueryError` whose `.cause` is the original. The real SQLSTATE lives one
 * level down, not on the wrapper itself; checking `err.code` directly (the obvious
 * thing to write) silently never matches, and every retry loop in this module quietly
 * stops retrying anything. Checked against a live unique-violation, not assumed.
 */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown; cause?: { code?: unknown } } | null)?.code
  const causeCode = (err as { cause?: { code?: unknown } } | null)?.cause?.code
  return code === UNIQUE_VIOLATION || causeCode === UNIQUE_VIOLATION
}

/** Short, stable, human-readable per-institution code, derived from the slug every
 *  time rather than stored — so it can never drift out of sync with it. */
export function referencePrefix(slug: string): string {
  const alnum = slug.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return alnum.slice(0, 10) || 'INST'
}

/**
 * Proposes the next reference for (institutionId, prefix, year) and hands it to
 * `insert`, which must actually persist a row using it. Retries on a unique-index
 * collision with a fresh count. Runs inside a savepoint so a collision only unwinds
 * this attempt — not the grievance-plus-audit-event write the caller is doing around
 * it in the same outer transaction.
 */
export async function withRetriedReference<T>(
  tx: Tx,
  institutionId: string,
  prefix: string,
  year: number,
  insert: (tx: Tx, reference: string) => Promise<T>,
): Promise<T> {
  const yearPrefix = `${prefix}-${year}-`

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await tx.transaction(async (sp) => {
        const [row] = await sp
          .select({ n: count() })
          .from(grievances)
          .where(
            and(eq(grievances.institutionId, institutionId), like(grievances.reference, `${yearPrefix}%`)),
          )
        const next = (row?.n ?? 0) + 1
        const reference = `${yearPrefix}${String(next).padStart(5, '0')}`
        return await insert(sp, reference)
      })
    } catch (err) {
      if (isUniqueViolation(err) && attempt < MAX_ATTEMPTS - 1) continue
      throw err
    }
  }
  // Unreachable: the loop above always returns or throws. Keeps TS's control-flow
  // analysis happy about the function actually returning T on every path.
  throw new Error('withRetriedReference: exhausted retries')
}
