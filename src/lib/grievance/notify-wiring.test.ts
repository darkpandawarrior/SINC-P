/**
 * The wiring between a grievance changing and somebody being told.
 *
 * The outbox has its own tests. This asserts the thing those cannot: that the write
 * paths actually call it, with the right recipient, and that anonymity is respected.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { dbAvailable } from '@/test/db'
import { pool, withTenant, withoutTenantScope } from '@/db/client'
import { categories, institutions, notifications, users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { assignGrievance, submitGrievance, transitionStatus } from './service'
import type { Actor } from './policy'

const SLUG = `notify-wire-${Date.now()}`

describe.skipIf(!dbAvailable)('notification wiring', () => {
  let instId = ''
  let categoryId = ''
  let student: Actor
  let moderator: Actor
  let officerId = ''
  let studentEmail = ''
  let officerEmail = ''

  beforeAll(async () => {
    const hash = await hashPassword('notify-wiring-password')
    await withoutTenantScope('test fixture', async (tx) => {
      const [inst] = await tx
        .insert(institutions)
        .values({ slug: SLUG, name: 'Wiring Institute' })
        .returning()
      instId = inst!.id

      const mk = async (role: 'student' | 'moderator' | 'redressal_officer', local: string) => {
        const [u] = await tx
          .insert(users)
          .values({
            institutionId: instId,
            email: `${local}@${SLUG}.test`,
            fullName: local,
            role,
            passwordHash: hash,
          })
          .returning()
        return u!
      }
      const s = await mk('student', 'student')
      const m = await mk('moderator', 'moderator')
      const o = await mk('redressal_officer', 'officer')
      studentEmail = s.email
      officerEmail = o.email
      officerId = o.id
      student = { id: s.id, role: 'student', institutionId: instId }
      moderator = { id: m.id, role: 'moderator', institutionId: instId }

      const [cat] = await tx
        .insert(categories)
        .values({ institutionId: instId, name: 'Hostel' })
        .returning()
      categoryId = cat!.id
    })
  })

  afterAll(async () => {
    await withoutTenantScope('test teardown', (tx) =>
      tx.delete(institutions).where(eq(institutions.id, instId)),
    )
    await pool.end()
  })

  const queued = (grievanceId: string) =>
    withTenant(instId, (tx) =>
      tx.select().from(notifications).where(eq(notifications.grievanceId, grievanceId)),
    )

  it('acknowledges a filing to the student who filed it', async () => {
    const g = await submitGrievance(student, {
      categoryId,
      kind: 'grievance',
      subject: 'No hot water in Block C',
      body: 'Third day without hot water.',
    })

    const rows = await queued(g.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe('grievance_submitted')
    expect(rows[0]!.recipientEmail).toBe(studentEmail)
    // The reference is the thing a student quotes at a counter, so it has to be in the
    // message rather than only in the portal.
    expect(rows[0]!.subject).toContain(g.reference)
  })

  it('stays silent for an anonymous filing', async () => {
    const g = await submitGrievance(student, {
      categoryId,
      kind: 'grievance',
      subject: 'Anonymous concern',
      body: 'Filed anonymously.',
      isAnonymous: true,
    })

    // The identity is retained for audit, but emailing it would defeat the promise the
    // filing form makes.
    expect(await queued(g.id)).toHaveLength(0)
  })

  it('tells the officer when a case is assigned to them', async () => {
    const g = await submitGrievance(student, {
      categoryId,
      kind: 'grievance',
      subject: 'Mess timings',
      body: 'Mess closes early.',
    })
    await assignGrievance(moderator, g.id, officerId)

    const rows = await queued(g.id)
    const assigned = rows.filter((r) => r.kind === 'assigned')
    expect(assigned).toHaveLength(1)
    expect(assigned[0]!.recipientEmail).toBe(officerEmail)
    // Who is handling it internally is routing detail and it changes; the student is
    // not told.
    expect(rows.some((r) => r.kind === 'assigned' && r.recipientEmail === studentEmail)).toBe(false)
  })

  it('tells the student when staff move the case', async () => {
    const g = await submitGrievance(student, {
      categoryId,
      kind: 'grievance',
      subject: 'Library access',
      body: 'Card not working.',
    })
    await transitionStatus(moderator, g.id, 'under_review', 'Screened and routed.')

    const changed = (await queued(g.id)).filter((r) => r.kind === 'status_changed')
    expect(changed).toHaveLength(1)
    expect(changed[0]!.recipientEmail).toBe(studentEmail)
    expect(changed[0]!.body).toContain('Screened and routed.')
  })

  it('does not email a student about their own action', async () => {
    const g = await submitGrievance(student, {
      categoryId,
      kind: 'grievance',
      subject: 'Withdrawing this',
      body: 'Filed by mistake.',
    })
    await transitionStatus(student, g.id, 'withdrawn', 'Filed by mistake.')

    // Telling someone what they just did is noise that trains people to filter the
    // address, and then they miss the message that mattered.
    const changed = (await queued(g.id)).filter((r) => r.kind === 'status_changed')
    expect(changed).toHaveLength(0)
  })

  it('rolls the acknowledgement back when the filing fails', async () => {
    const before = await withTenant(instId, (tx) =>
      tx.select().from(notifications).where(eq(notifications.institutionId, instId)),
    )

    await expect(
      submitGrievance(student, {
        categoryId: '00000000-0000-0000-0000-000000000000',
        kind: 'grievance',
        subject: 'Bad category',
        body: 'This should not file.',
      }),
    ).rejects.toThrow()

    const after = await withTenant(instId, (tx) =>
      tx.select().from(notifications).where(eq(notifications.institutionId, instId)),
    )
    expect(after.length).toBe(before.length)
  })

  it('scopes every queued message to the filing institution', async () => {
    const rows = await withTenant(instId, (tx) =>
      tx
        .select()
        .from(notifications)
        .where(and(eq(notifications.institutionId, instId))),
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.institutionId).toBe(instId)
  })
})
