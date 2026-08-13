/**
 * The campus handbook — the deflection half of the Information pillar. Roughly a third
 * of a campus complaint box is a question with a documented answer; this exists so the
 * filing form can answer before it accepts, and so staff can see which answers have
 * gone stale.
 */
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant, type Tx } from '@/db/client'
import { handbookEntries, type HandbookEntry } from '@/db/schema'
import { AuthError } from '@/lib/auth/session'
import { isStaff, type Actor } from '@/lib/grievance/policy'
import { slugify, withUniqueSlug } from '@/lib/slug'

const uuidSchema = z.uuid()

/** Stale policy is worse than no policy (per the build brief). A year is a plain policy
 *  choice, not a regulatory figure the way the grievance SLA windows are — make it
 *  per-institution configurable the day a customer asks for a different cadence. */
export const STALE_AFTER_DAYS = 365

export const handbookEntryInputSchema = z.object({
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(10_000),
  categoryId: z.uuid().nullable().optional(),
  owningOffice: z.string().trim().max(200).nullable().optional(),
  isPublished: z.boolean().default(false),
})
export type HandbookEntryInput = z.input<typeof handbookEntryInputSchema>

const listFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: z.uuid().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})
export type ListHandbookFilters = z.input<typeof listFiltersSchema>

export interface ListHandbookResult {
  items: HandbookEntry[]
  total: number
}

function requireStaff(actor: Actor) {
  if (!isStaff(actor.role)) throw new AuthError('forbidden')
}

export function isStale(entry: Pick<HandbookEntry, 'reviewedAt'>, now: Date = new Date()): boolean {
  if (!entry.reviewedAt) return true
  const ageMs = now.getTime() - entry.reviewedAt.getTime()
  return ageMs > STALE_AFTER_DAYS * 86_400_000
}

async function loadOwn(tx: Tx, institutionId: string, id: string): Promise<HandbookEntry | null> {
  const rows = await tx
    .select()
    .from(handbookEntries)
    .where(and(eq(handbookEntries.id, id), eq(handbookEntries.institutionId, institutionId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createHandbookEntry(actor: Actor, input: HandbookEntryInput): Promise<HandbookEntry> {
  requireStaff(actor)
  const parsed = handbookEntryInputSchema.parse(input)

  return withTenant(actor.institutionId, async (tx) => {
    const now = new Date()
    return withUniqueSlug(tx, slugify(parsed.question), async (sp, slug) => {
      const [row] = await sp
        .insert(handbookEntries)
        .values({
          institutionId: actor.institutionId,
          categoryId: parsed.categoryId ?? null,
          question: parsed.question,
          slug,
          answer: parsed.answer,
          owningOffice: parsed.owningOffice ?? null,
          isPublished: parsed.isPublished,
          // Writing an entry down IS reviewing it; a fresh entry should never read as
          // stale on day one.
          reviewedAt: now,
          createdAt: now,
        })
        .returning()
      if (!row) throw new Error('createHandbookEntry: insert returned no row')
      return row
    })
  })
}

/** Editing content counts as re-confirming it's still accurate, so this also stamps
 *  `reviewedAt`. Use `markReviewed` instead when nothing changed but staff want to
 *  confirm an answer is still correct. */
export async function updateHandbookEntry(
  actor: Actor,
  id: string,
  input: HandbookEntryInput,
): Promise<HandbookEntry | null> {
  requireStaff(actor)
  const validId = uuidSchema.parse(id)
  const parsed = handbookEntryInputSchema.parse(input)

  return withTenant(actor.institutionId, async (tx) => {
    const existing = await loadOwn(tx, actor.institutionId, validId)
    if (!existing) return null

    const [row] = await tx
      .update(handbookEntries)
      .set({
        categoryId: parsed.categoryId ?? null,
        question: parsed.question,
        answer: parsed.answer,
        owningOffice: parsed.owningOffice ?? null,
        isPublished: parsed.isPublished,
        reviewedAt: new Date(),
      })
      .where(and(eq(handbookEntries.id, validId), eq(handbookEntries.institutionId, actor.institutionId)))
      .returning()
    return row ?? null
  })
}

export async function markReviewed(actor: Actor, id: string): Promise<HandbookEntry | null> {
  requireStaff(actor)
  const validId = uuidSchema.parse(id)

  return withTenant(actor.institutionId, async (tx) => {
    const [row] = await tx
      .update(handbookEntries)
      .set({ reviewedAt: new Date() })
      .where(and(eq(handbookEntries.id, validId), eq(handbookEntries.institutionId, actor.institutionId)))
      .returning()
    return row ?? null
  })
}

/** No per-visitor dedupe: an anonymous "was this helpful" vote can be cast more than
 *  once by the same person. Real abuse would need a tracked identity to dedupe against,
 *  which is more infrastructure than a single yes/no button has earned so far. */
export async function recordHelpfulVote(
  institutionId: string,
  id: string,
  helpful: boolean,
): Promise<HandbookEntry | null> {
  const validId = uuidSchema.parse(id)

  return withTenant(institutionId, async (tx) => {
    const existing = await loadOwn(tx, institutionId, validId)
    if (!existing || !existing.isPublished) return null

    // An atomic `col = col + 1` in SQL rather than read-then-write in JS — two votes
    // landing in the same instant must not clobber each other down to a single +1.
    const [row] = await tx
      .update(handbookEntries)
      .set(
        helpful
          ? { helpfulCount: sql`${handbookEntries.helpfulCount} + 1` }
          : { notHelpfulCount: sql`${handbookEntries.notHelpfulCount} + 1` },
      )
      .where(and(eq(handbookEntries.id, validId), eq(handbookEntries.institutionId, institutionId)))
      .returning()
    return row ?? null
  })
}

export async function listPublishedHandbookEntries(
  institutionId: string,
  filters: ListHandbookFilters = {},
): Promise<ListHandbookResult> {
  const { q, categoryId, page, pageSize } = listFiltersSchema.parse(filters)

  return withTenant(institutionId, async (tx) => {
    const conditions = [eq(handbookEntries.institutionId, institutionId), eq(handbookEntries.isPublished, true)]
    if (categoryId) conditions.push(eq(handbookEntries.categoryId, categoryId))
    if (q) conditions.push(or(ilike(handbookEntries.question, `%${q}%`), ilike(handbookEntries.answer, `%${q}%`))!)
    const where = and(...conditions)

    // ponytail: fetches every matching row and paginates in JS rather than a second
    // COUNT query + SQL LIMIT/OFFSET. A college's handbook is dozens of entries, not
    // thousands — upgrade to a real COUNT+LIMIT pair if that stops being true.
    const rows = await tx.select().from(handbookEntries).where(where).orderBy(asc(handbookEntries.question))
    const total = rows.length
    const items = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    return { items, total }
  })
}

export async function getHandbookEntryBySlug(
  institutionId: string,
  slug: string,
  actor: Actor | null,
): Promise<HandbookEntry | null> {
  return withTenant(institutionId, async (tx) => {
    const rows = await tx
      .select()
      .from(handbookEntries)
      .where(and(eq(handbookEntries.institutionId, institutionId), eq(handbookEntries.slug, slug)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    if (row.isPublished) return row
    if (actor && actor.institutionId === institutionId && isStaff(actor.role)) return row
    return null
  })
}

/** Every entry, published or not, stalest-first — the staff console's whole point is
 *  surfacing the ones that need attention before the public list would show them wrong. */
export async function listAllHandbookEntriesForStaff(actor: Actor): Promise<HandbookEntry[]> {
  requireStaff(actor)
  return withTenant(actor.institutionId, (tx) =>
    tx
      .select()
      .from(handbookEntries)
      .where(eq(handbookEntries.institutionId, actor.institutionId))
      .orderBy(desc(isNull(handbookEntries.reviewedAt)), asc(handbookEntries.reviewedAt)),
  )
}

/** Used by the admin category-deletion guard and by the count on /admin/categories. */
export async function countHandbookEntriesInCategory(institutionId: string, categoryId: string): Promise<number> {
  return withTenant(institutionId, async (tx) => {
    const [row] = await tx
      .select({ n: count() })
      .from(handbookEntries)
      .where(and(eq(handbookEntries.institutionId, institutionId), eq(handbookEntries.categoryId, categoryId)))
    return row?.n ?? 0
  })
}

