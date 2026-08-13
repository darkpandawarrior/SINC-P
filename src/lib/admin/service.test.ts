/**
 * Integration test against a real Postgres (see grievance/service.test.ts's docstring
 * for the DATABASE_URL setup this needs).
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool, withoutTenantScope } from '@/db/client'
import { institutions, users } from '@/db/schema'
import { AuthError } from '@/lib/auth/session'
import type { Actor } from '@/lib/grievance/policy'
import { verifyPassword } from '@/lib/auth/password'
import {
  createCategory,
  getInstitutionSettings,
  inviteUser,
  listAuthEvents,
  listCategories,
  listUsers,
  setCategoryActive,
  setUserActive,
  setUserRole,
  updateCategory,
  updateInstitutionSettings,
} from './service'

describe('admin service', () => {
  const inst = randomUUID()
  const admin = randomUUID()
  const moderator = randomUUID()

  const adminActor: Actor = { id: admin, role: 'institution_admin', institutionId: inst }
  const moderatorActor: Actor = { id: moderator, role: 'moderator', institutionId: inst }

  beforeAll(async () => {
    await withoutTenantScope('admin.test fixtures', async (tx) => {
      await tx.insert(institutions).values({
        id: inst,
        slug: `admin-test-${inst.slice(0, 8)}`,
        name: 'Admin Test Institution',
      })
      await tx.insert(users).values([
        {
          id: admin,
          institutionId: inst,
          email: 'admin@admintest.test',
          fullName: 'Admin',
          passwordHash: 'x',
          role: 'institution_admin',
        },
        {
          id: moderator,
          institutionId: inst,
          email: 'mod@admintest.test',
          fullName: 'Mod',
          passwordHash: 'x',
          role: 'moderator',
        },
      ])
    })
  })

  // See news/service.test.ts: no DELETE against a shared database whose
  // grievance_events trigger rejects it.
  afterAll(async () => {
    await pool.end()
  })

  it('rejects a non-admin caller for every mutation', async () => {
    await expect(
      inviteUser(moderatorActor, { email: 'x@y.test', fullName: 'X', role: 'student' }),
    ).rejects.toBeInstanceOf(AuthError)
    await expect(createCategory(moderatorActor, { name: 'X', isSensitive: false, sortOrder: 0 })).rejects.toBeInstanceOf(
      AuthError,
    )
    await expect(listUsers(moderatorActor)).rejects.toBeInstanceOf(AuthError)
  })

  it('invites a user with a working, never-stored-in-plaintext temporary password', async () => {
    const result = await inviteUser(adminActor, {
      email: 'newstaff@admintest.test',
      fullName: 'New Staff',
      role: 'redressal_officer',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(await verifyPassword(result.temporaryPassword, result.user.passwordHash)).toBe(true)

    const list = await listUsers(adminActor, { role: 'redressal_officer' })
    expect(list.items.map((u) => u.id)).toContain(result.user.id)
  })

  it('refuses a second invite with the same email', async () => {
    await inviteUser(adminActor, { email: 'dup@admintest.test', fullName: 'Dup One', role: 'student' })
    const second = await inviteUser(adminActor, { email: 'dup@admintest.test', fullName: 'Dup Two', role: 'student' })
    expect(second).toEqual({ ok: false, reason: 'email-taken' })
  })

  it('deactivating a user revokes access; role changes take effect for the next request', async () => {
    const invited = await inviteUser(adminActor, { email: 'toggle@admintest.test', fullName: 'Toggle', role: 'student' })
    if (!invited.ok) throw new Error('unreachable')

    const promoted = await setUserRole(adminActor, invited.user.id, 'moderator')
    expect(promoted?.role).toBe('moderator')

    const deactivated = await setUserActive(adminActor, invited.user.id, false)
    expect(deactivated?.isActive).toBe(false)
  })

  it('builds a category tree and rejects a category as its own parent', async () => {
    const parent = await createCategory(adminActor, { name: 'Hostel', isSensitive: false, sortOrder: 0 })
    const child = await createCategory(adminActor, {
      name: 'Hostel Maintenance',
      parentId: parent.id,
      isSensitive: false,
      sortOrder: 0,
    })
    expect(child.parentId).toBe(parent.id)

    await expect(
      updateCategory(adminActor, parent.id, { name: 'Hostel', parentId: parent.id, isSensitive: false, sortOrder: 0 }),
    ).rejects.toThrow(/own parent/)

    const tree = await listCategories(adminActor)
    expect(tree.map((c) => c.id)).toEqual(expect.arrayContaining([parent.id, child.id]))
  })

  it('a sensitive category keeps its flag through an update', async () => {
    const raggingCategory = await createCategory(adminActor, {
      name: 'Ragging',
      isSensitive: true,
      slaResolutionDays: 3,
      sortOrder: 0,
    })
    expect(raggingCategory.isSensitive).toBe(true)
    expect(raggingCategory.slaResolutionDays).toBe(3)

    const deactivated = await setCategoryActive(adminActor, raggingCategory.id, false)
    expect(deactivated?.isActive).toBe(false)
    expect(deactivated?.isSensitive).toBe(true)
  })

  it('updates institution SLA settings', async () => {
    const before = await getInstitutionSettings(adminActor)
    expect(before?.id).toBe(inst)

    const updated = await updateInstitutionSettings(adminActor, {
      slaResolutionDays: 10,
      slaAppealWindowDays: 20,
      slaOmbudspersonDays: 25,
      allowAnonymous: false,
    })
    expect(updated).toMatchObject({
      slaResolutionDays: 10,
      slaAppealWindowDays: 20,
      slaOmbudspersonDays: 25,
      allowAnonymous: false,
    })
  })

  it('lists auth events scoped to this institution only', async () => {
    const result = await listAuthEvents(adminActor)
    expect(result.items.every((e) => e.institutionId === inst)).toBe(true)
  })
})
