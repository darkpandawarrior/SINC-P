/**
 * ICC confidentiality, through the real query layer against a real database.
 *
 * `policy.test.ts` already proves `canView` refuses an ICC case to everyone outside the
 * committee. That is not enough on its own: a list endpoint never calls `canView`, it
 * builds a WHERE clause and returns whatever matches. `roleScopeCondition` returned
 * `undefined` for moderator and institution_admin, meaning no restriction at all, so
 * without a track filter the officer queue would have handed a moderator every sexual
 * harassment complaint in the institution.
 *
 * These tests exist because a per-record check does not protect a list endpoint, and the
 * only way to know is to run the query.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { dbAvailable } from '@/test/db'
import { pool, withTenant, withoutTenantScope } from '@/db/client'
import { categories, grievances, institutions, users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { complianceSnapshot, getGrievanceForActor, listGrievances, listQueue } from './service'
import type { Actor, Role } from './policy'

const SLUG = `icc-track-${Date.now()}`
const DAY = 86_400_000

describe.skipIf(!dbAvailable)('ICC track confidentiality', () => {
  let instId = ''
  let iccId = ''
  let sgrcId = ''
  let studentActor: Actor
  const actors = {} as Record<Role, Actor>

  beforeAll(async () => {
    const hash = await hashPassword('icc-track-test-password')
    await withoutTenantScope('test fixture', async (tx) => {
      const [inst] = await tx
        .insert(institutions)
        .values({ slug: SLUG, name: 'ICC Track College' })
        .returning()
      instId = inst!.id

      const mk = async (role: Role, local: string) => {
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
        const a: Actor = { id: u!.id, role, institutionId: instId }
        actors[role] = a
        return a
      }
      studentActor = await mk('student', 'student')
      await mk('moderator', 'moderator')
      await mk('redressal_officer', 'officer')
      await mk('ombudsperson', 'ombudsperson')
      await mk('icc_member', 'iccmember')
      await mk('institution_admin', 'registrar')

      const [iccCat] = await tx
        .insert(categories)
        .values({ institutionId: instId, name: 'Sexual Harassment (ICC)', track: 'icc' })
        .returning()
      const [sgrcCat] = await tx
        .insert(categories)
        .values({ institutionId: instId, name: 'Hostel', track: 'sgrc' })
        .returning()

      const now = Date.now()
      const mkG = async (ref: string, categoryId: string, track: 'icc' | 'sgrc') => {
        const [g] = await tx
          .insert(grievances)
          .values({
            institutionId: instId,
            reference: ref,
            submittedById: studentActor.id,
            categoryId,
            track,
            subject: `Case ${ref}`,
            body: 'Body text for the case under test.',
            status: 'in_progress',
            dueAt: new Date(now + 30 * DAY),
            createdAt: new Date(now - 5 * DAY),
          })
          .returning()
        return g!.id
      }
      iccId = await mkG('ICC-1', iccCat!.id, 'icc')
      sgrcId = await mkG('SGRC-1', sgrcCat!.id, 'sgrc')
    })
  })

  afterAll(async () => {
    await withoutTenantScope('test teardown', (tx) =>
      tx.delete(institutions).where(eq(institutions.id, instId)),
    )
    await pool.end()
  })

  const OUTSIDERS: Role[] = ['moderator', 'institution_admin', 'redressal_officer', 'ombudsperson']

  it('keeps ICC cases out of the officer queue for every role outside the committee', async () => {
    for (const role of OUTSIDERS) {
      const queue = await listQueue(actors[role], { page: 1 })
      const leaked = queue.items.filter((g) => g.track === 'icc')
      expect(leaked, `${role} saw ${leaked.length} ICC case(s) in the queue`).toHaveLength(0)
    }
  })

  it('shows the ICC case in the committee member queue', async () => {
    const queue = await listQueue(actors.icc_member, { page: 1 })
    expect(queue.items.map((g) => g.id)).toContain(iccId)
  })

  it('shows the committee member nothing from the general queue', async () => {
    // The gate runs both ways. Committee membership is not a wildcard.
    const queue = await listQueue(actors.icc_member, { page: 1 })
    expect(queue.items.every((g) => g.track === 'icc')).toBe(true)
    expect(queue.items.map((g) => g.id)).not.toContain(sgrcId)
  })

  it('refuses a direct read of an ICC case by reference or id', async () => {
    for (const role of OUTSIDERS) {
      const direct = await getGrievanceForActor(actors[role], iccId)
      expect(direct, `${role} read the ICC case directly`).toBeNull()
    }
    expect(await getGrievanceForActor(actors.icc_member, iccId)).not.toBeNull()
  })

  it('still lets the student who filed it see their own ICC case', async () => {
    const mine = await listGrievances(studentActor, { page: 1 })
    expect(mine.items.map((g) => g.id)).toContain(iccId)
    expect(await getGrievanceForActor(studentActor, iccId)).not.toBeNull()
  })

  it('leaves the general queue working for the roles that own it', async () => {
    // A confidentiality control that also breaks the ordinary case is not a win.
    const modQueue = await listQueue(actors.moderator, { page: 1 })
    expect(modQueue.items.map((g) => g.id)).toContain(sgrcId)
  })

  it('counts ICC cases out of the queue total, not merely off the page', async () => {
    // Filtering the page but not the count would leak the existence and number of
    // sexual harassment complaints through pagination, which is its own disclosure.
    const modQueue = await listQueue(actors.moderator, { page: 1 })
    const iccQueue = await listQueue(actors.icc_member, { page: 1 })
    const all = await withTenant(instId, (tx) =>
      tx.select().from(grievances).where(eq(grievances.institutionId, instId)),
    )
    expect(all).toHaveLength(2)
    expect(modQueue.total).toBe(1)
    expect(iccQueue.total).toBe(1)
  })

  it('does not leak an ICC case through a category filter', async () => {
    const [iccCat] = await withTenant(instId, (tx) =>
      tx
        .select()
        .from(categories)
        .where(and(eq(categories.institutionId, instId), eq(categories.track, 'icc')))
        .limit(1),
    )
    // Guessing the category id must not become a way around the track gate.
    const queue = await listQueue(actors.moderator, { categoryId: iccCat!.id, page: 1 })
    expect(queue.items).toHaveLength(0)
    expect(queue.total).toBe(0)
  })

  it('keeps ICC out of the compliance dashboard, counts and category names alike', async () => {
    // An aggregate leaks as effectively as a row. "Sexual Harassment (ICC): 2 filed"
    // discloses both the existence and the volume of complaints that are confidential to
    // the committee, and a zero row still discloses that the channel exists at all.
    const snapshot = await complianceSnapshot(actors.moderator)
    expect(snapshot).not.toBeNull()
    if (!snapshot) return

    const names = snapshot.byCategory.map((c) => c.categoryName.toLowerCase())
    expect(names.some((n) => n.includes('icc') || n.includes('harassment'))).toBe(false)
    // The ICC case must not be inside the filed total either.
    expect(snapshot.totalFiled).toBe(1)
  })
})
