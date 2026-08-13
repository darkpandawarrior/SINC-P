/**
 * Integration test against a real Postgres (see grievance/service.test.ts's docstring
 * for the DATABASE_URL setup this needs).
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbAvailable } from '@/test/db'
import { pool, withoutTenantScope } from '@/db/client'
import { institutions, users } from '@/db/schema'
import { AuthError } from '@/lib/auth/session'
import type { Actor } from '@/lib/grievance/policy'
import {
  createAnnouncement,
  expireAnnouncement,
  getAnnouncementBySlug,
  listDraftAnnouncements,
  listPublicAnnouncements,
  publishAnnouncement,
} from './service'

describe.skipIf(!dbAvailable)('news service', () => {
  const inst = randomUUID()
  const otherInst = randomUUID()
  const moderator = randomUUID()
  const student = randomUUID()

  const staffActor: Actor = { id: moderator, role: 'moderator', institutionId: inst }
  const studentActor: Actor = { id: student, role: 'student', institutionId: inst }

  beforeAll(async () => {
    await withoutTenantScope('news.test fixtures', async (tx) => {
      await tx.insert(institutions).values([
        { id: inst, slug: `news-test-${inst.slice(0, 8)}`, name: 'News Test Institution' },
        { id: otherInst, slug: `news-test-b-${otherInst.slice(0, 8)}`, name: 'News Test Institution B' },
      ])
      await tx.insert(users).values([
        {
          id: moderator,
          institutionId: inst,
          email: 'mod@news.test',
          fullName: 'Mod',
          passwordHash: 'x',
          role: 'moderator',
        },
        {
          id: student,
          institutionId: inst,
          email: 'student@news.test',
          fullName: 'Student',
          passwordHash: 'x',
          role: 'student',
        },
      ])
    })
  })

  // No DELETE here: this is a shared dev/CI database other suites' fixtures live in
  // too, and (per grievance/service.test.ts) an unscoped or even a correctly-scoped
  // delete that cascades into grievance_events hits the append-only trigger in
  // drizzle/0001_rls.sql and fails the whole transaction. Just close the pool.
  afterAll(async () => {
    await pool.end()
  })

  it('rejects a non-staff author', async () => {
    await expect(
      createAnnouncement(studentActor, {
        title: 'Hostel water outage',
        body: 'Water will be off 6-9am.',
        channel: 'administrative',
      }),
    ).rejects.toBeInstanceOf(AuthError)
  })

  it('creates a draft invisible to the public list, then publishes it into view', async () => {
    const draft = await createAnnouncement(staffActor, {
      title: 'Annual Sports Meet 2026',
      body: 'Registrations open next week.',
      channel: 'sports',
    })
    expect(draft.publishedAt).toBeNull()
    expect(draft.slug).toBe('annual-sports-meet-2026')

    const beforePublish = await listPublicAnnouncements(inst)
    expect(beforePublish.items.map((a) => a.id)).not.toContain(draft.id)

    const drafts = await listDraftAnnouncements(staffActor)
    expect(drafts.map((a) => a.id)).toContain(draft.id)

    const published = await publishAnnouncement(staffActor, draft.id)
    expect(published?.publishedAt).not.toBeNull()

    const afterPublish = await listPublicAnnouncements(inst)
    expect(afterPublish.items.map((a) => a.id)).toContain(draft.id)
  })

  it('publishNow creates a live announcement in one step', async () => {
    const live = await createAnnouncement(staffActor, {
      title: 'Placement Drive — TechCorp',
      body: 'On-campus drive next Monday.',
      channel: 'placement',
      publishNow: true,
    })
    expect(live.publishedAt).not.toBeNull()

    const result = await listPublicAnnouncements(inst, { channel: 'placement' })
    expect(result.items.map((a) => a.id)).toContain(live.id)
  })

  it('expiring an announcement removes it from the public list immediately', async () => {
    const live = await createAnnouncement(staffActor, {
      title: 'Library extended hours',
      body: 'Open till midnight during exams.',
      channel: 'academic',
      publishNow: true,
    })
    await expireAnnouncement(staffActor, live.id)

    const result = await listPublicAnnouncements(inst)
    expect(result.items.map((a) => a.id)).not.toContain(live.id)
  })

  it('pins sort first regardless of publish time', async () => {
    const first = await createAnnouncement(staffActor, {
      title: 'Older notice',
      body: 'body',
      channel: 'society',
      publishNow: true,
    })
    const pinned = await createAnnouncement(staffActor, {
      title: 'Pinned notice',
      body: 'body',
      channel: 'society',
      isPinned: true,
      publishNow: true,
    })
    void first

    const result = await listPublicAnnouncements(inst, { channel: 'society' })
    expect(result.items[0]?.id).toBe(pinned.id)
  })

  it('two announcements with the same title get distinct slugs', async () => {
    const a = await createAnnouncement(staffActor, { title: 'Diwali Break', body: 'x', channel: 'administrative' })
    const b = await createAnnouncement(staffActor, { title: 'Diwali Break', body: 'y', channel: 'administrative' })
    expect(a.slug).not.toBe(b.slug)
  })

  it('a staff preview sees an unpublished announcement by slug; the public does not', async () => {
    const draft = await createAnnouncement(staffActor, { title: 'Unpublished Draft X', body: 'x', channel: 'academic' })

    const staffView = await getAnnouncementBySlug(inst, draft.slug, staffActor)
    expect(staffView?.id).toBe(draft.id)

    const publicView = await getAnnouncementBySlug(inst, draft.slug, null)
    expect(publicView).toBeNull()
  })

  it('is tenant-scoped: institution B never sees institution A announcements', async () => {
    const result = await listPublicAnnouncements(otherInst)
    expect(result.items).toHaveLength(0)
  })
})
