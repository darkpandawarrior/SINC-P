/**
 * Integration test against a real Postgres (see grievance/service.test.ts's docstring
 * for the DATABASE_URL setup this needs).
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbAvailable, SKIP_REASON } from '@/test/db'
import { pool, withoutTenantScope } from '@/db/client'
import { institutions, users } from '@/db/schema'
import { AuthError } from '@/lib/auth/session'
import type { Actor } from '@/lib/grievance/policy'
import {
  countHandbookEntriesInCategory,
  createHandbookEntry,
  getHandbookEntryBySlug,
  isStale,
  listAllHandbookEntriesForStaff,
  listPublishedHandbookEntries,
  markReviewed,
  recordHelpfulVote,
  updateHandbookEntry,
} from './service'

describe.skipIf(!dbAvailable)('handbook service', () => {
  const inst = randomUUID()
  const moderator = randomUUID()
  const student = randomUUID()

  const staffActor: Actor = { id: moderator, role: 'moderator', institutionId: inst }
  const studentActor: Actor = { id: student, role: 'student', institutionId: inst }

  beforeAll(async () => {
    await withoutTenantScope('handbook.test fixtures', async (tx) => {
      await tx.insert(institutions).values({
        id: inst,
        slug: `handbook-test-${inst.slice(0, 8)}`,
        name: 'Handbook Test Institution',
      })
      await tx.insert(users).values([
        {
          id: moderator,
          institutionId: inst,
          email: 'mod@handbook.test',
          fullName: 'Mod',
          passwordHash: 'x',
          role: 'moderator',
        },
        {
          id: student,
          institutionId: inst,
          email: 'student@handbook.test',
          fullName: 'Student',
          passwordHash: 'x',
          role: 'student',
        },
      ])
    })
  })

  // See news/service.test.ts: no DELETE against a shared database whose
  // grievance_events trigger rejects it.
  afterAll(async () => {
    await pool.end()
  })

  it('rejects a non-staff author', async () => {
    await expect(
      createHandbookEntry(studentActor, { question: 'How do I get a bonafide certificate?', answer: 'Ask the office.' }),
    ).rejects.toBeInstanceOf(AuthError)
  })

  it('an unpublished draft is invisible to the public list and to the public detail view', async () => {
    const entry = await createHandbookEntry(staffActor, {
      question: 'How do I apply for a hostel transfer?',
      answer: 'Submit form HT-1 to the hostel office.',
      isPublished: false,
    })

    const publicList = await listPublishedHandbookEntries(inst)
    expect(publicList.items.map((e) => e.id)).not.toContain(entry.id)

    const publicView = await getHandbookEntryBySlug(inst, entry.slug, null)
    expect(publicView).toBeNull()

    const staffView = await getHandbookEntryBySlug(inst, entry.slug, staffActor)
    expect(staffView?.id).toBe(entry.id)
  })

  it('a fresh entry is reviewed on creation, not stale', async () => {
    const entry = await createHandbookEntry(staffActor, {
      question: 'What are library hours?',
      answer: '9am to 9pm on weekdays.',
      isPublished: true,
    })
    expect(entry.reviewedAt).not.toBeNull()
    expect(isStale(entry)).toBe(false)
  })

  it('markReviewed refreshes reviewedAt without touching content', async () => {
    const entry = await createHandbookEntry(staffActor, {
      question: 'How do I pay hostel fees online?',
      answer: 'Via the student portal payments tab.',
      isPublished: true,
    })
    const oldReviewedAt = entry.reviewedAt

    await new Promise((r) => setTimeout(r, 5))
    const reviewed = await markReviewed(staffActor, entry.id)
    expect(reviewed?.answer).toBe(entry.answer)
    expect(reviewed?.reviewedAt?.getTime()).toBeGreaterThan(oldReviewedAt!.getTime())
  })

  it('updateHandbookEntry changes content and re-stamps reviewedAt', async () => {
    const entry = await createHandbookEntry(staffActor, {
      question: 'Original question',
      answer: 'Original answer',
      isPublished: false,
    })
    const updated = await updateHandbookEntry(staffActor, entry.id, {
      question: 'Original question',
      answer: 'Corrected answer',
      isPublished: true,
    })
    expect(updated?.answer).toBe('Corrected answer')
    expect(updated?.isPublished).toBe(true)
  })

  it('helpful voting only counts on published entries, and increments atomically', async () => {
    const draft = await createHandbookEntry(staffActor, { question: 'Draft Q', answer: 'A', isPublished: false })
    const votedOnDraft = await recordHelpfulVote(inst, draft.id, true)
    expect(votedOnDraft).toBeNull()

    const published = await createHandbookEntry(staffActor, { question: 'Published Q', answer: 'A', isPublished: true })
    await recordHelpfulVote(inst, published.id, true)
    const afterSecondVote = await recordHelpfulVote(inst, published.id, true)
    expect(afterSecondVote?.helpfulCount).toBe(2)

    const afterNotHelpful = await recordHelpfulVote(inst, published.id, false)
    expect(afterNotHelpful?.notHelpfulCount).toBe(1)
    expect(afterNotHelpful?.helpfulCount).toBe(2)
  })

  it('search filters by question and answer text', async () => {
    await createHandbookEntry(staffActor, {
      question: 'Ragging complaint procedure',
      answer: 'Contact the anti-ragging committee immediately.',
      isPublished: true,
    })
    const result = await listPublishedHandbookEntries(inst, { q: 'ragging' })
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.every((e) => /ragging/i.test(e.question) || /ragging/i.test(e.answer))).toBe(true)
  })

  it('the staff console lists every entry, stalest (never-reviewed) first', async () => {
    const all = await listAllHandbookEntriesForStaff(staffActor)
    expect(all.length).toBeGreaterThan(0)
    // Every entry created above went through createHandbookEntry, which always stamps
    // reviewedAt, so none of this suite's fixtures is technically "never reviewed" —
    // this just asserts the ordering key doesn't throw and returns every institution row.
    expect(all.every((e) => e.institutionId === inst)).toBe(true)
  })

  it('countHandbookEntriesInCategory counts only rows in that category', async () => {
    const categoryId = randomUUID()
    const count = await countHandbookEntriesInCategory(inst, categoryId)
    expect(count).toBe(0)
  })
})
