/**
 * Institution admin: users, the category tree, institution-wide settings, and a
 * read-only view of the security trail. Every function here is a second, independent
 * gate beyond whatever the route/layout already checked — Server Actions are reachable
 * by anyone who can POST to them (see Next's Server Actions security guidance), so
 * `requireInstitutionAdmin` runs inside the service layer itself, not just in a layout.
 */
import { randomBytes } from 'node:crypto'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant, type Tx } from '@/db/client'
import { authEvents, categories, institutions, userRole, users, type Category, type Institution, type User } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { AuthError, destroyAllSessionsFor } from '@/lib/auth/session'
import { type Actor, type Role } from '@/lib/grievance/policy'
import { isUniqueViolation } from '@/lib/grievance/reference'

const uuidSchema = z.uuid()
const ROLE_VALUES = userRole.enumValues as [Role, ...Role[]]

// schema.ts exports no AuthEvent type (it's frozen — see the build brief — and the
// bottom-of-file `export type X = typeof x.$inferSelect` block simply doesn't include
// this table), so it's derived here rather than added there.
export type AuthEvent = typeof authEvents.$inferSelect

function requireInstitutionAdmin(actor: Actor) {
  if (actor.role !== 'institution_admin') throw new AuthError('forbidden')
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const inviteUserInputSchema = z.object({
  email: z.email().max(255),
  fullName: z.string().trim().min(1).max(200),
  role: z.enum(ROLE_VALUES),
  rollNumber: z.string().trim().max(64).optional(),
  department: z.string().trim().max(200).optional(),
})
export type InviteUserInput = z.input<typeof inviteUserInputSchema>

export type InviteUserResult =
  | { ok: true; user: User; temporaryPassword: string }
  | { ok: false; reason: 'email-taken' }

/**
 * There is no email-delivery infrastructure in this repo and no self-service password
 * reset UI to hand off to yet (that's a seam owned by the auth vertical, not this one).
 * So this generates a strong random password, hashes it, and returns the plaintext
 * ONCE in the result for the admin to relay by hand — the same shape scripts/seed.ts
 * already uses for its own demo accounts. Never stored, never logged.
 *
 * ponytail: a real deployment wants an email invite + forced password reset. Upgrade
 * when the auth vertical ships a reset-token-backed onboarding page this can redirect
 * into instead of printing a password.
 */
export async function inviteUser(actor: Actor, input: InviteUserInput): Promise<InviteUserResult> {
  requireInstitutionAdmin(actor)
  const parsed = inviteUserInputSchema.parse(input)
  const temporaryPassword = randomBytes(9).toString('base64url') // 12 chars, clears MIN_PASSWORD_LENGTH
  const passwordHash = await hashPassword(temporaryPassword)

  try {
    return await withTenant(actor.institutionId, async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          institutionId: actor.institutionId,
          email: parsed.email.toLowerCase(),
          fullName: parsed.fullName,
          role: parsed.role,
          rollNumber: parsed.rollNumber ?? null,
          department: parsed.department ?? null,
          passwordHash,
        })
        .returning()
      if (!user) throw new Error('inviteUser: insert returned no row')
      return { ok: true, user, temporaryPassword }
    })
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'email-taken' }
    throw err
  }
}

const listUsersFiltersSchema = z.object({
  role: z.enum(ROLE_VALUES).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})
export type ListUsersFilters = z.input<typeof listUsersFiltersSchema>

export async function listUsers(actor: Actor, filters: ListUsersFilters = {}) {
  requireInstitutionAdmin(actor)
  const { role, page, pageSize } = listUsersFiltersSchema.parse(filters)

  return withTenant(actor.institutionId, async (tx) => {
    const conditions = [eq(users.institutionId, actor.institutionId)]
    if (role) conditions.push(eq(users.role, role))
    const where = and(...conditions)

    const [items, totalRows] = await Promise.all([
      tx
        .select()
        .from(users)
        .where(where)
        .orderBy(asc(users.fullName))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      tx.select({ n: count() }).from(users).where(where),
    ])
    return { items, total: totalRows[0]?.n ?? 0 }
  })
}

export async function setUserRole(actor: Actor, userId: string, role: Role): Promise<User | null> {
  requireInstitutionAdmin(actor)
  const validId = uuidSchema.parse(userId)
  const validRole = z.enum(ROLE_VALUES).parse(role)

  return withTenant(actor.institutionId, async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ role: validRole })
      .where(and(eq(users.id, validId), eq(users.institutionId, actor.institutionId)))
      .returning()
    return row ?? null
  })
}

/** Deactivating kills every live session immediately — the design intent stated right
 *  in session.ts's own header: "disable this officer's access now has to actually mean
 *  now". Reactivating does not need the mirror image; a signed-out user just logs in. */
export async function setUserActive(actor: Actor, userId: string, isActive: boolean): Promise<User | null> {
  requireInstitutionAdmin(actor)
  const validId = uuidSchema.parse(userId)

  const updated = await withTenant(actor.institutionId, async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ isActive })
      .where(and(eq(users.id, validId), eq(users.institutionId, actor.institutionId)))
      .returning()
    return row ?? null
  })
  if (updated && !isActive) await destroyAllSessionsFor(updated.id)
  return updated
}

// ---------------------------------------------------------------------------
// Category tree
// ---------------------------------------------------------------------------

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  parentId: z.uuid().nullable().optional(),
  slaResolutionDays: z.number().int().min(1).max(365).nullable().optional(),
  isSensitive: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})
export type CategoryInput = z.input<typeof categoryInputSchema>

async function assertValidParent(tx: Tx, institutionId: string, parentId: string | null, selfId?: string) {
  if (!parentId) return
  if (parentId === selfId) throw new Error('a category cannot be its own parent')
  const [parent] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, parentId), eq(categories.institutionId, institutionId)))
    .limit(1)
  if (!parent) throw new Error('unknown parent category')
}

export async function listCategories(actor: Actor): Promise<Category[]> {
  requireInstitutionAdmin(actor)
  return withTenant(actor.institutionId, (tx) =>
    tx
      .select()
      .from(categories)
      .where(eq(categories.institutionId, actor.institutionId))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
  )
}

export async function createCategory(actor: Actor, input: CategoryInput): Promise<Category> {
  requireInstitutionAdmin(actor)
  const parsed = categoryInputSchema.parse(input)

  return withTenant(actor.institutionId, async (tx) => {
    await assertValidParent(tx, actor.institutionId, parsed.parentId ?? null)
    const [row] = await tx
      .insert(categories)
      .values({
        institutionId: actor.institutionId,
        name: parsed.name,
        description: parsed.description ?? null,
        parentId: parsed.parentId ?? null,
        slaResolutionDays: parsed.slaResolutionDays ?? null,
        isSensitive: parsed.isSensitive,
        sortOrder: parsed.sortOrder,
      })
      .returning()
    if (!row) throw new Error('createCategory: insert returned no row')
    return row
  })
}

export async function updateCategory(actor: Actor, id: string, input: CategoryInput): Promise<Category | null> {
  requireInstitutionAdmin(actor)
  const validId = uuidSchema.parse(id)
  const parsed = categoryInputSchema.parse(input)

  return withTenant(actor.institutionId, async (tx) => {
    await assertValidParent(tx, actor.institutionId, parsed.parentId ?? null, validId)
    const [row] = await tx
      .update(categories)
      .set({
        name: parsed.name,
        description: parsed.description ?? null,
        parentId: parsed.parentId ?? null,
        slaResolutionDays: parsed.slaResolutionDays ?? null,
        isSensitive: parsed.isSensitive,
        sortOrder: parsed.sortOrder,
      })
      .where(and(eq(categories.id, validId), eq(categories.institutionId, actor.institutionId)))
      .returning()
    return row ?? null
  })
}

/** Categories are never deleted — grievances and handbook entries reference them by id
 *  (`onDelete: 'set null'` in the schema would silently orphan the label off historical
 *  rows). Deactivating removes it from the filing form without touching history. */
export async function setCategoryActive(actor: Actor, id: string, isActive: boolean): Promise<Category | null> {
  requireInstitutionAdmin(actor)
  const validId = uuidSchema.parse(id)

  return withTenant(actor.institutionId, async (tx) => {
    const [row] = await tx
      .update(categories)
      .set({ isActive })
      .where(and(eq(categories.id, validId), eq(categories.institutionId, actor.institutionId)))
      .returning()
    return row ?? null
  })
}

// ---------------------------------------------------------------------------
// Institution settings
// ---------------------------------------------------------------------------

export const institutionSettingsInputSchema = z.object({
  slaResolutionDays: z.number().int().min(1).max(365),
  slaAppealWindowDays: z.number().int().min(1).max(365),
  slaOmbudspersonDays: z.number().int().min(1).max(365),
  allowAnonymous: z.boolean(),
})
export type InstitutionSettingsInput = z.input<typeof institutionSettingsInputSchema>

export async function getInstitutionSettings(actor: Actor): Promise<Institution | null> {
  requireInstitutionAdmin(actor)
  return withTenant(actor.institutionId, async (tx) => {
    const [row] = await tx.select().from(institutions).where(eq(institutions.id, actor.institutionId)).limit(1)
    return row ?? null
  })
}

export async function updateInstitutionSettings(
  actor: Actor,
  input: InstitutionSettingsInput,
): Promise<Institution | null> {
  requireInstitutionAdmin(actor)
  const parsed = institutionSettingsInputSchema.parse(input)

  return withTenant(actor.institutionId, async (tx) => {
    const [row] = await tx
      .update(institutions)
      .set(parsed)
      .where(eq(institutions.id, actor.institutionId))
      .returning()
    return row ?? null
  })
}

// ---------------------------------------------------------------------------
// Security trail (read-only)
// ---------------------------------------------------------------------------

const listAuthEventsFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
})
export type ListAuthEventsFilters = z.input<typeof listAuthEventsFiltersSchema>

export async function listAuthEvents(actor: Actor, filters: ListAuthEventsFilters = {}) {
  requireInstitutionAdmin(actor)
  const { page, pageSize } = listAuthEventsFiltersSchema.parse(filters)

  return withTenant(actor.institutionId, async (tx) => {
    const where = eq(authEvents.institutionId, actor.institutionId)
    const [items, totalRows] = await Promise.all([
      tx
        .select()
        .from(authEvents)
        .where(where)
        .orderBy(desc(authEvents.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      tx.select({ n: count() }).from(authEvents).where(where),
    ])
    return { items, total: totalRows[0]?.n ?? 0 }
  })
}
