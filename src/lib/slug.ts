/**
 * Slugs for announcements and handbook entries — the two tables outside the grievance
 * vertical that carry a `(institution_id, slug)` unique index. `withUniqueSlug` mirrors
 * the retry shape `grievance/reference.ts` already uses for its own unique column: try
 * the natural value, and if a concurrent writer just took it, retry inside a savepoint
 * rather than unwinding the caller's whole transaction. `isUniqueViolation` is imported
 * rather than re-derived — it exists specifically because drizzle-node-postgres wraps
 * every error, so the real SQLSTATE is one level down at `.cause.code`; that is a fact
 * about the driver, not about grievances, and re-discovering it here would be the same
 * bug waiting to happen a second time.
 */
import { randomBytes } from 'node:crypto'
import type { Tx } from '@/db/client'
import { isUniqueViolation } from '@/lib/grievance/reference'

// Combining diacritical marks block (U+0300-U+036F). Built via RegExp(string) rather
// than a /.../ literal so the codepoints are plain ASCII "̀" text in this file,
// not raw combining characters sitting in source — those render invisibly and are one
// bad copy-paste or editor re-encode away from silently turning into something else.
const COMBINING_MARKS_RE = new RegExp('[\\u0300-\\u036f]', 'g')

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD') // decomposes "é" into "e" + a combining acute accent
    .replace(COMBINING_MARKS_RE, '') // ...which this then strips, so "café" -> "cafe"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150) // *_slug columns are varchar(160); leave room for a dedupe suffix
  return base || 'untitled'
}

const MAX_ATTEMPTS = 5

/**
 * Attempts `base` first, then `base-<4 hex chars>` on a collision. A random suffix
 * rather than a counted one (`-2`, `-3`, ...) skips the extra read reference.ts needs —
 * that scheme exists there to keep grievance references sequential and human-readable
 * over the phone; a slug's only job is to be a unique, stable URL segment.
 */
export async function withUniqueSlug<T>(
  tx: Tx,
  base: string,
  insert: (tx: Tx, slug: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`
    try {
      return await tx.transaction((sp) => insert(sp, slug))
    } catch (err) {
      if (isUniqueViolation(err) && attempt < MAX_ATTEMPTS - 1) continue
      throw err
    }
  }
  throw new Error('withUniqueSlug: exhausted retries')
}
