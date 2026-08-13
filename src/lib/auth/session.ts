/**
 * Server-side sessions.
 *
 * The cookie holds a random 32-byte token. The database holds only its SHA-256, so a
 * leaked database dump does not hand the attacker live sessions. Revocation is a DELETE,
 * which is the property a stateless JWT cannot give us — and in a compliance product,
 * "disable this officer's access now" has to actually mean now.
 *
 * The 2019 code set `$_SESSION['login'] = $_POST['username']` and every page then did
 * `if (strlen($_SESSION['login']) == 0)`. Role was implied by which directory the file
 * lived in, so a student who guessed /admin/ URLs was only stopped by that same check —
 * which passed, because they were logged in.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { withTenant, withoutTenantScope } from '@/db/client'
import { sessions, users, type User } from '@/db/schema'

export const SESSION_COOKIE = 'sincp_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 12 // 12h; a campus office session, not a month
const TOKEN_BYTES = 32

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export interface SessionContext {
  user: User
  institutionId: string
  expiresAt: Date
}

/** Create a session and set the cookie. Returns the raw token for tests. */
export async function createSession(
  user: Pick<User, 'id' | 'institutionId'>,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  // `sessions` is a tenant table under FORCE RLS, so this insert must carry tenant
  // context or Postgres rejects it outright ("new row violates row-level security
  // policy"). The institution is known here, so this is a plain withTenant.
  await withTenant(user.institutionId, (tx) =>
    tx.insert(sessions).values({
      tokenHash: hashToken(token),
      userId: user.id,
      institutionId: user.institutionId,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    }),
  )

  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, // no JS access, so XSS cannot exfiltrate it
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // 'strict' would break the email link -> grievance flow
    path: '/',
    expires: expiresAt,
  })

  return token
}

/**
 * Resolve the current session, or null.
 *
 * Deliberately does one indexed lookup on the token hash and then checks expiry in the
 * query rather than in JS — an expired row must never resolve, even briefly.
 */
export async function getSession(): Promise<SessionContext | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null

  // Genuinely pre-tenant: the cookie is an opaque token, and which institution it
  // belongs to is exactly what this query is for. Same shape as the login lookup.
  // The token hash is a 256-bit secret, so this is not a browsable cross-tenant read.
  const rows = await withoutTenantScope('session lookup resolves the tenant', (tx) =>
    tx
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .limit(1),
  )

  const row = rows[0]
  if (!row) return null

  // A deactivated account must lose access immediately, without waiting for expiry.
  if (!row.user.isActive) {
    await destroySessionByHash(row.session.tokenHash)
    return null
  }

  return {
    user: row.user,
    institutionId: row.session.institutionId,
    expiresAt: row.session.expiresAt,
  }
}

/** Throwing variant for route handlers and server actions. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession()
  if (!session) throw new AuthError('unauthenticated')
  return session
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await destroySessionByHash(hashToken(token))
  jar.delete(SESSION_COOKIE)
}

async function destroySessionByHash(tokenHash: string) {
  // Revocation must work without knowing the tenant — the caller only holds a cookie.
  await withoutTenantScope('session revocation by opaque token', (tx) =>
    tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash)),
  )
}

/** Invalidate every session for a user — password change, role change, deactivation. */
export async function destroyAllSessionsFor(userId: string): Promise<void> {
  // This is the one that makes "deactivate this officer" mean *now*. If it silently
  // affects zero rows, an offboarded account keeps its live session until expiry.
  await withoutTenantScope('revoke every session for a user', (tx) =>
    tx.delete(sessions).where(eq(sessions.userId, userId)),
  )
}

/** Housekeeping, called from a cron route. Expired rows are dead weight and a
 *  needless retention liability under DPDP. */
export async function pruneExpiredSessions(): Promise<number> {
  const deleted = await withoutTenantScope('cross-tenant session housekeeping', (tx) =>
    tx.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning(),
  )
  return deleted.length
}

export class AuthError extends Error {
  constructor(public readonly kind: 'unauthenticated' | 'forbidden') {
    super(kind)
    this.name = 'AuthError'
  }
}

/**
 * Compare two secrets in constant time. Used for CSRF tokens and the double-submit
 * cookie; `===` on secrets leaks length and prefix through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
