/**
 * News — the honest v1.5 surface from the ADR: announcements, pinning, expiry. No
 * scheduling engine, no workflow, no revisions. Publish is "set publishedAt now" and
 * expire is "set expiresAt now"; there is nothing in between to build.
 */
import { and, count, desc, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant, type Tx } from '@/db/client'
import { announcements, type Announcement } from '@/db/schema'
import { AuthError } from '@/lib/auth/session'
import { isStaff, type Actor } from '@/lib/grievance/policy'
import { slugify, withUniqueSlug } from '@/lib/slug'

export const NEWS_CHANNELS = ['society', 'sports', 'placement', 'academic', 'administrative'] as const
export type NewsChannel = (typeof NEWS_CHANNELS)[number]

const uuidSchema = z.uuid()

export const createAnnouncementInputSchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1).max(20_000),
  channel: z.enum(NEWS_CHANNELS),
  isPinned: z.boolean().default(false),
  publishNow: z.boolean().default(false),
})
export type CreateAnnouncementInput = z.input<typeof createAnnouncementInputSchema>

const listFiltersSchema = z.object({
  channel: z.enum(NEWS_CHANNELS).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})
export type ListAnnouncementsFilters = z.input<typeof listFiltersSchema>

export interface ListAnnouncementsResult {
  items: Announcement[]
  total: number
}

function requireStaff(actor: Actor) {
  if (!isStaff(actor.role)) throw new AuthError('forbidden')
}

async function loadOwn(tx: Tx, institutionId: string, id: string): Promise<Announcement | null> {
  const rows = await tx
    .select()
    .from(announcements)
    .where(and(eq(announcements.id, id), eq(announcements.institutionId, institutionId)))
    .limit(1)
  return rows[0] ?? null
}

export async function createAnnouncement(actor: Actor, input: CreateAnnouncementInput): Promise<Announcement> {
  requireStaff(actor)
  const parsed = createAnnouncementInputSchema.parse(input)

  return withTenant(actor.institutionId, async (tx) => {
    const now = new Date()
    return withUniqueSlug(tx, slugify(parsed.title), async (sp, slug) => {
      const [row] = await sp
        .insert(announcements)
        .values({
          institutionId: actor.institutionId,
          authorId: actor.id,
          title: parsed.title,
          slug,
          summary: parsed.summary ?? null,
          body: parsed.body,
          channel: parsed.channel,
          isPinned: parsed.isPinned,
          publishedAt: parsed.publishNow ? now : null,
          createdAt: now,
        })
        .returning()
      if (!row) throw new Error('createAnnouncement: insert returned no row')
      return row
    })
  })
}

export async function publishAnnouncement(actor: Actor, id: string): Promise<Announcement | null> {
  requireStaff(actor)
  const validId = uuidSchema.parse(id)

  return withTenant(actor.institutionId, async (tx) => {
    const existing = await loadOwn(tx, actor.institutionId, validId)
    if (!existing) return null
    if (existing.publishedAt) return existing // already published, no-op

    const [row] = await tx
      .update(announcements)
      .set({ publishedAt: new Date() })
      .where(and(eq(announcements.id, validId), eq(announcements.institutionId, actor.institutionId)))
      .returning()
    return row ?? null
  })
}

export async function expireAnnouncement(actor: Actor, id: string): Promise<Announcement | null> {
  requireStaff(actor)
  const validId = uuidSchema.parse(id)

  return withTenant(actor.institutionId, async (tx) => {
    const [row] = await tx
      .update(announcements)
      .set({ expiresAt: new Date() })
      .where(and(eq(announcements.id, validId), eq(announcements.institutionId, actor.institutionId)))
      .returning()
    return row ?? null
  })
}

/** Published (publishedAt set and not in the future) and not yet expired, pinned first
 *  then newest. This is the only query an anonymous visitor's request can reach. */
export async function listPublicAnnouncements(
  institutionId: string,
  filters: ListAnnouncementsFilters = {},
): Promise<ListAnnouncementsResult> {
  const { channel, page, pageSize } = listFiltersSchema.parse(filters)

  return withTenant(institutionId, async (tx) => {
    const now = new Date()
    const conditions = [
      eq(announcements.institutionId, institutionId),
      isNotNull(announcements.publishedAt),
      lte(announcements.publishedAt, now),
      or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now)),
    ]
    if (channel) conditions.push(eq(announcements.channel, channel))
    const where = and(...conditions)

    const [items, totalRows] = await Promise.all([
      tx
        .select()
        .from(announcements)
        .where(where)
        .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      tx.select({ n: count() }).from(announcements).where(where),
    ])

    return { items, total: totalRows[0]?.n ?? 0 }
  })
}

/** Drafts (never published) for the compose queue. Staff only. */
export async function listDraftAnnouncements(actor: Actor): Promise<Announcement[]> {
  requireStaff(actor)
  return withTenant(actor.institutionId, (tx) =>
    tx
      .select()
      .from(announcements)
      .where(and(eq(announcements.institutionId, actor.institutionId), isNull(announcements.publishedAt)))
      .orderBy(desc(announcements.createdAt)),
  )
}

/**
 * The only read path for a single announcement by slug. A public visitor only ever
 * matches the published-and-current branch; staff previewing their own draft is the one
 * case that also matches an unpublished or expired row. Returns null rather than
 * distinguishing "no such slug" from "not visible yet" — same reasoning as
 * getGrievanceForActor: don't tell a prober which one it was.
 */
export async function getAnnouncementBySlug(
  institutionId: string,
  slug: string,
  actor: Actor | null,
): Promise<Announcement | null> {
  return withTenant(institutionId, async (tx) => {
    const rows = await tx
      .select()
      .from(announcements)
      .where(and(eq(announcements.institutionId, institutionId), eq(announcements.slug, slug)))
      .limit(1)
    const row = rows[0]
    if (!row) return null

    const now = new Date()
    const isLive = !!row.publishedAt && row.publishedAt <= now && (!row.expiresAt || row.expiresAt > now)
    if (isLive) return row
    if (actor && actor.institutionId === institutionId && isStaff(actor.role)) return row
    return null
  })
}
