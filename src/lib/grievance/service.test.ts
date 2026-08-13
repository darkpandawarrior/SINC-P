/**
 * Integration test: exercises the real transaction + audit-chain machinery against a
 * real Postgres (withTenant, RLS, the append-only trigger, the lot) — no mock of
 * anything this module owns. Needs a reachable DATABASE_URL with schema + RLS applied:
 *
 *   npm run db:up && npx drizzle-kit push && psql "$DATABASE_URL" -f drizzle/0001_rls.sql
 *   npm test -- service.test.ts
 */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbAvailable } from '@/test/db'
import { pool, withoutTenantScope, withTenant } from '@/db/client'
import { categories, grievanceEvents, handbookEntries, institutions, users } from '@/db/schema'
import type { Actor } from '@/lib/grievance/policy'
import { GENESIS_HASH, verifyChain } from './audit'
import {
  addRemark,
  assignGrievance,
  closeGrievance,
  fileAppeal,
  getGrievanceByReference,
  getGrievanceForActor,
  getInstitution,
  listGrievances,
  listHandbookForCategory,
  submitGrievance,
  transitionStatus,
  withdrawGrievance,
} from './service'

describe.skipIf(!dbAvailable)('grievance service', () => {
  const instA = randomUUID()
  const instB = randomUUID()
  const categoryId = randomUUID()
  const student = randomUUID()
  const otherStudent = randomUUID()
  const outsiderStudent = randomUUID() // in instB
  const moderator = randomUUID()
  const officer = randomUUID()
  const ombudsperson = randomUUID()

  const studentActor: Actor = { id: student, role: 'student', institutionId: instA }
  const otherStudentActor: Actor = { id: otherStudent, role: 'student', institutionId: instA }
  const outsiderActor: Actor = { id: outsiderStudent, role: 'student', institutionId: instB }
  const moderatorActor: Actor = { id: moderator, role: 'moderator', institutionId: instA }
  const officerActor: Actor = { id: officer, role: 'redressal_officer', institutionId: instA }
  const ombudspersonActor: Actor = { id: ombudsperson, role: 'ombudsperson', institutionId: instA }

  beforeAll(async () => {
    await withoutTenantScope('service.test fixtures', async (tx) => {
      await tx.insert(institutions).values([
        { id: instA, slug: `svc-test-a-${instA.slice(0, 8)}`, name: 'Service Test Institution A' },
        { id: instB, slug: `svc-test-b-${instB.slice(0, 8)}`, name: 'Service Test Institution B' },
      ])
      await tx.insert(users).values([
        { id: student, institutionId: instA, email: 's1@a.test', fullName: 'S1', passwordHash: 'x', role: 'student' },
        {
          id: otherStudent,
          institutionId: instA,
          email: 's2@a.test',
          fullName: 'S2',
          passwordHash: 'x',
          role: 'student',
        },
        {
          id: outsiderStudent,
          institutionId: instB,
          email: 's3@b.test',
          fullName: 'S3',
          passwordHash: 'x',
          role: 'student',
        },
        {
          id: moderator,
          institutionId: instA,
          email: 'mod@a.test',
          fullName: 'Mod',
          passwordHash: 'x',
          role: 'moderator',
        },
        {
          id: officer,
          institutionId: instA,
          email: 'officer@a.test',
          fullName: 'Officer',
          passwordHash: 'x',
          role: 'redressal_officer',
        },
        {
          id: ombudsperson,
          institutionId: instA,
          email: 'omb@a.test',
          fullName: 'Omb',
          passwordHash: 'x',
          role: 'ombudsperson',
        },
      ])
      await tx.insert(categories).values({
        id: categoryId,
        institutionId: instA,
        name: 'Hostel',
        isActive: true,
      })
      await tx.insert(handbookEntries).values([
        {
          institutionId: instA,
          categoryId,
          question: 'How do I apply for hostel room reallocation?',
          slug: `hostel-reallocation-${instA.slice(0, 8)}`,
          answer: 'Submit the reallocation form to the Hostel Office.',
          isPublished: true,
        },
        {
          // Unpublished — must never surface as a deflection match.
          institutionId: instA,
          categoryId,
          question: 'Draft entry, not reviewed yet',
          slug: `draft-entry-${instA.slice(0, 8)}`,
          answer: 'placeholder',
          isPublished: false,
        },
      ])
    })
  })

  afterAll(async () => {
    // No DELETE here, on purpose: this suite is the one that actually populates
    // grievance_events, and the append-only trigger in drizzle/0001_rls.sql rejects a
    // DELETE on that table unconditionally — including one cascaded down from
    // `institutions`, and including from sincp_admin (REVOKE UPDATE, DELETE ...FROM
    // sincp_admin, same file). That is correct behaviour for a compliance system: there
    // is no code path, privileged or not, that can erase a written event. It just means
    // these fixture rows are permanent in whatever database this runs against, the same
    // way scripts/seed.ts's demo data is — fine for the disposable local dev container,
    // and a throwaway CI database is the real cleanup mechanism otherwise.
    await pool.end()
  })

  async function eventsFor(grievanceId: string) {
    return withTenant(instA, (tx) =>
      tx.select().from(grievanceEvents).where(eq(grievanceEvents.grievanceId, grievanceId)).orderBy(grievanceEvents.seq),
    )
  }

  describe('submitGrievance', () => {
    it('writes the grievance and a single seq-1 submitted event, atomically', async () => {
      const g = await submitGrievance(studentActor, {
        categoryId,
        subject: 'Mess food is undercooked',
        body: 'This has been going on for a week and nobody has responded.',
      })

      expect(g.status).toBe('submitted')
      expect(g.reference).toMatch(/^SVCTESTA[0-9A-F]*-\d{4}-\d{5}$/)
      expect(g.dueAt).not.toBeNull()

      const events = await eventsFor(g.id)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ seq: 1, type: 'submitted', prevHash: GENESIS_HASH })
      expect(verifyChain(events)).toEqual({ ok: true, length: 1 })
    })

    it('assigns gap-free, sequential references within an institution/year', async () => {
      const [g1, g2] = await Promise.all([
        submitGrievance(studentActor, { categoryId, subject: 'First one here', body: 'a'.repeat(20) }),
        submitGrievance(studentActor, { categoryId, subject: 'Second one here', body: 'b'.repeat(20) }),
      ])
      expect(g1.reference).not.toBe(g2.reference)
      const n1 = Number(g1.reference.split('-').at(-1))
      const n2 = Number(g2.reference.split('-').at(-1))
      expect(Math.abs(n1 - n2)).toBe(1)
    })
  })

  describe('transitionStatus — the illegal transition matrix', () => {
    it('refuses a transition the state machine does not allow, and touches nothing', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'Illegal jump test', body: 'x'.repeat(20) })

      // submitted -> resolved is not a legal edge at all.
      const result = await transitionStatus(moderatorActor, g.id, 'resolved')
      expect(result).toEqual({ ok: false, reason: 'illegal-transition' })

      const after = await getGrievanceForActor(studentActor, g.id)
      expect(after?.status).toBe('submitted')
      expect(await eventsFor(g.id)).toHaveLength(1) // still only the submitted event
    })

    it('refuses sliding a closed grievance back to in_progress', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'Closed slide test', body: 'x'.repeat(20) })
      await transitionStatus(moderatorActor, g.id, 'under_review')
      await assignGrievance(moderatorActor, g.id, officer)
      await transitionStatus(officerActor, g.id, 'in_progress')
      await transitionStatus(officerActor, g.id, 'resolved')
      const closed = await transitionStatus(studentActor, g.id, 'closed')
      expect(closed.ok).toBe(true)

      const result = await transitionStatus(officerActor, g.id, 'in_progress')
      expect(result).toEqual({ ok: false, reason: 'illegal-transition' })
    })
  })

  it('stops a student from transitioning another student\'s grievance', async () => {
    const g = await submitGrievance(studentActor, { categoryId, subject: 'Not yours', body: 'x'.repeat(20) })

    const result = await transitionStatus(otherStudentActor, g.id, 'withdrawn')
    expect(result).toEqual({ ok: false, reason: 'not-visible' }) // the 2019 IDOR, at the service layer

    const after = await getGrievanceForActor(studentActor, g.id)
    expect(after?.status).toBe('submitted')
    expect(await eventsFor(g.id)).toHaveLength(1)
  })

  it('stops a user from a different institution entirely', async () => {
    const g = await submitGrievance(studentActor, { categoryId, subject: 'Cross tenant', body: 'x'.repeat(20) })
    const result = await transitionStatus(outsiderActor, g.id, 'withdrawn')
    expect(result).toEqual({ ok: false, reason: 'not-visible' })
  })

  it('withdraws through the same path as any other transition', async () => {
    const g = await submitGrievance(studentActor, { categoryId, subject: 'Withdraw me', body: 'x'.repeat(20) })
    const result = await withdrawGrievance(studentActor, g.id, 'changed my mind')
    expect(result).toEqual({ ok: true, grievance: expect.objectContaining({ status: 'withdrawn' }) })
    expect(await transitionStatus(studentActor, g.id, 'under_review')).toEqual({
      ok: false,
      reason: 'illegal-transition', // withdrawn is terminal
    })
  })

  describe('chain integrity across a full lifecycle', () => {
    it('verifies end to end: submit -> review -> assign -> progress -> resolve -> close -> appeal', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'Full lifecycle', body: 'x'.repeat(30) })
      await transitionStatus(moderatorActor, g.id, 'under_review', 'screened')
      await assignGrievance(moderatorActor, g.id, officer)
      await addRemark(officerActor, g.id, 'looking into it', 'internal')
      await transitionStatus(officerActor, g.id, 'in_progress')
      await transitionStatus(officerActor, g.id, 'resolved', 'fixed the leak')
      await transitionStatus(studentActor, g.id, 'closed', 'satisfied')

      const appealResult = await fileAppeal(studentActor, g.id, { body: 'y'.repeat(30) })
      expect(appealResult.ok).toBe(true)
      if (!appealResult.ok) throw new Error('unreachable')
      expect(appealResult.original.status).toBe('appealed')
      expect(appealResult.appeal.kind).toBe('appeal')
      expect(appealResult.appeal.appealOfId).toBe(g.id)

      const originalEvents = await eventsFor(g.id)
      expect(verifyChain(originalEvents)).toMatchObject({ ok: true })
      // submitted, status_changed x3 (review/progress/resolve), assigned, remark_added, closed's status_changed, appealed
      expect(originalEvents.map((e) => e.type)).toEqual([
        'submitted',
        'status_changed',
        'assigned',
        'remark_added',
        'status_changed',
        'status_changed',
        'status_changed',
        'appealed',
      ])

      const appealEvents = await eventsFor(appealResult.appeal.id)
      expect(verifyChain(appealEvents)).toEqual({ ok: true, length: 1 })

      // The Ombudsperson can now see both halves of the appeal.
      const seenOriginal = await getGrievanceForActor(ombudspersonActor, g.id)
      const seenAppeal = await getGrievanceForActor(ombudspersonActor, appealResult.appeal.id)
      expect(seenOriginal?.status).toBe('appealed')
      expect(seenAppeal?.appealOfId).toBe(g.id)
    })
  })

  describe('concurrent event append', () => {
    it('retries the (grievance_id, seq) collision so every concurrent remark lands with a dense, valid chain', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'Concurrency test', body: 'x'.repeat(20) })
      await transitionStatus(moderatorActor, g.id, 'under_review')
      await assignGrievance(moderatorActor, g.id, officer)

      const CONCURRENCY = 8
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, (_, i) => addRemark(officerActor, g.id, `remark ${i}`, 'public')),
      )
      expect(results.every((r) => r !== null)).toBe(true)

      const events = await eventsFor(g.id)
      // 1 submitted + 1 status_changed + 1 assigned + CONCURRENCY remarks
      expect(events).toHaveLength(3 + CONCURRENCY)
      const seqs = events.map((e) => e.seq)
      expect(new Set(seqs).size).toBe(seqs.length) // no duplicate seq — the unique index held
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
      expect(verifyChain(events)).toEqual({ ok: true, length: 3 + CONCURRENCY })
    })
  })

  describe('anonymous filing does not leak identity', () => {
    it('hides submittedById from staff in both the single read and the list, never from the filer', async () => {
      const g = await submitGrievance(studentActor, {
        categoryId,
        subject: 'Filed anonymously',
        body: 'x'.repeat(20),
        isAnonymous: true,
      })
      expect(g.submittedById).toBe(student) // never masked for the actor who filed it

      const asFiler = await getGrievanceForActor(studentActor, g.id)
      expect(asFiler?.submittedById).toBe(student) // the filer still sees themself

      const asModerator = await getGrievanceForActor(moderatorActor, g.id)
      expect(asModerator?.submittedById).toBeNull()

      const staffList = await listGrievances(moderatorActor, { pageSize: 100 })
      const found = staffList.items.find((item) => item.id === g.id)
      expect(found).toBeDefined()
      expect(found?.submittedById).toBeNull()

      const studentList = await listGrievances(studentActor, { pageSize: 100 })
      const ownFound = studentList.items.find((item) => item.id === g.id)
      expect(ownFound?.submittedById).toBe(student)
    })
  })

  describe('listGrievances role scoping', () => {
    it('gives a student only their own grievances', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'Scoping test', body: 'x'.repeat(20) })
      const list = await listGrievances(studentActor, { pageSize: 100 })
      // Never masked for the filer themself, even for their own anonymous filings —
      // toActorView only hides identity from staff.
      expect(list.items.every((item) => item.submittedById === student)).toBe(true)
      expect(list.items.some((item) => item.id === g.id)).toBe(true)
    })

    it('gives an officer their assigned queue plus the unassigned pool, never someone else\'s pickup', async () => {
      const unassigned = await submitGrievance(studentActor, { categoryId, subject: 'Unassigned', body: 'x'.repeat(20) })
      const mine = await submitGrievance(studentActor, { categoryId, subject: 'Assigned to me', body: 'x'.repeat(20) })
      await transitionStatus(moderatorActor, mine.id, 'under_review')
      await assignGrievance(moderatorActor, mine.id, officer)

      const list = await listGrievances(officerActor, { pageSize: 100 })
      const ids = list.items.map((i) => i.id)
      expect(ids).toContain(unassigned.id)
      expect(ids).toContain(mine.id)
    })
  })

  describe('student portal reads', () => {
    it('getGrievanceByReference finds by the human reference and refuses the same way a stranger would', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'By reference', body: 'x'.repeat(20) })

      const own = await getGrievanceByReference(studentActor, g.reference)
      expect(own?.id).toBe(g.id)

      expect(await getGrievanceByReference(otherStudentActor, g.reference)).toBeNull()
      expect(await getGrievanceByReference(studentActor, 'NOT-A-REAL-REFERENCE')).toBeNull()
    })

    it('getInstitution returns the caller\'s own tenant row', async () => {
      const institution = await getInstitution(studentActor)
      expect(institution?.id).toBe(instA)
    })

    it('listHandbookForCategory returns only published entries for that category', async () => {
      const entries = await listHandbookForCategory(studentActor, categoryId)
      expect(entries.length).toBe(1)
      expect(entries[0]?.question).toBe('How do I apply for hostel room reallocation?')

      const otherCategory = randomUUID()
      expect(await listHandbookForCategory(studentActor, otherCategory)).toEqual([])
    })

    it('closeGrievance accepts a resolution and records the rating in one event', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'Close and rate', body: 'x'.repeat(20) })
      await transitionStatus(moderatorActor, g.id, 'under_review')
      await assignGrievance(moderatorActor, g.id, officer)
      await transitionStatus(officerActor, g.id, 'in_progress')
      await transitionStatus(officerActor, g.id, 'resolved')

      const result = await closeGrievance(studentActor, g.id, { satisfactionRating: 4, remark: 'thanks' })
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.grievance.status).toBe('closed')
      expect(result.grievance.satisfactionRating).toBe(4)

      const events = await eventsFor(g.id)
      const closeEvent = events.at(-1)
      expect(closeEvent).toMatchObject({
        type: 'status_changed',
        remark: 'thanks',
        payload: { from: 'resolved', to: 'closed', satisfactionRating: 4 },
      })
      expect(verifyChain(events)).toMatchObject({ ok: true })
    })

    it('closeGrievance refuses a grievance that is not yet resolved', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'Too early to close', body: 'x'.repeat(20) })
      const result = await closeGrievance(studentActor, g.id, { satisfactionRating: 5 })
      expect(result).toEqual({ ok: false, reason: 'illegal-transition' })
    })

    it('closeGrievance refuses another student\'s grievance', async () => {
      const g = await submitGrievance(studentActor, { categoryId, subject: 'Not yours to close', body: 'x'.repeat(20) })
      await transitionStatus(moderatorActor, g.id, 'under_review')
      await assignGrievance(moderatorActor, g.id, officer)
      await transitionStatus(officerActor, g.id, 'in_progress')
      await transitionStatus(officerActor, g.id, 'resolved')

      const result = await closeGrievance(otherStudentActor, g.id, {})
      expect(result).toEqual({ ok: false, reason: 'not-visible' })
    })
  })
})
