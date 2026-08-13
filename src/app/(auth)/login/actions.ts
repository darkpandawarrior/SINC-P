'use server'

import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { withoutTenantScope } from '@/db/client'
import { users } from '@/db/schema'
import { createSession } from '@/lib/auth/session'
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password'
import { isCsrfValid } from '@/lib/auth/csrf'
import { checkLoginRateLimit } from '@/lib/auth/ratelimit'
import { logAuthEvent } from '@/lib/auth/events'
import { clientIp, requestUserAgent } from '@/lib/auth/request-meta'
import { isSafeReturnTo } from '@/lib/auth/return-to'

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(1024),
})

/**
 * One message for every failure mode.
 *
 * The 2019 login had two: "Invalid username or password" for a bad password, and a
 * separate path for a bad email, which turned the form into an account enumeration
 * oracle. Wrong password, unknown address, deactivated account and rate limit all
 * return this same string.
 */
const GENERIC_FAILURE = 'Email or password is incorrect.'

export interface LoginState {
  error?: string
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!(await isCsrfValid(formData))) {
    return { error: 'Your session expired. Please try again.' }
  }

  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: GENERIC_FAILURE }

  const email = parsed.data.email.toLowerCase().trim()
  const ip = await clientIp()
  const userAgent = await requestUserAgent()

  if (!checkLoginRateLimit(ip, email)) {
    await logAuthEvent({
      institutionId: null,
      userId: null,
      kind: 'login_failure',
      email,
      ipAddress: ip,
      userAgent,
      detail: { reason: 'rate_limited' },
    })
    return { error: GENERIC_FAILURE }
  }

  // The tenant is not known until the user is found, so this is one of the few genuine
  // uses of the cross-tenant role. Email is unique per institution, not globally, so a
  // shared address across two colleges would need the institution picker; the seed data
  // uses per-college domains, which keeps this unambiguous.
  const found = await withoutTenantScope('login lookup precedes knowing the tenant', (tx) =>
    tx
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isActive, true)))
      .limit(1),
  )

  const user = found[0]
  if (!user) {
    // Hash anyway so a missing account and a wrong password take the same time.
    // Without this the response time alone answers "does this address exist".
    await verifyPassword(parsed.data.password, 'scrypt$65536$8$1$YQ==$Yg==')
    await logAuthEvent({
      institutionId: null,
      userId: null,
      kind: 'login_failure',
      email,
      ipAddress: ip,
      userAgent,
      detail: { reason: 'no_such_user' },
    })
    return { error: GENERIC_FAILURE }
  }

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await logAuthEvent({
      kind: 'login_failure',
      institutionId: user.institutionId,
      userId: user.id,
      email,
      ipAddress: ip,
      userAgent,
      detail: { reason: 'bad_password' },
    })
    return { error: GENERIC_FAILURE }
  }

  // Transparent upgrade when the stored parameters are weaker than current policy.
  if (needsRehash(user.passwordHash)) {
    const upgraded = await hashPassword(parsed.data.password)
    await withoutTenantScope('password rehash on login', (tx) =>
      tx.update(users).set({ passwordHash: upgraded }).where(eq(users.id, user.id)),
    )
  }

  await createSession(user, { ipAddress: ip, userAgent })
  await logAuthEvent({
    kind: 'login_success',
    institutionId: user.institutionId,
    userId: user.id,
    email,
    ipAddress: ip,
    userAgent,
  })

  const requested = formData.get('returnTo')
  const target = isSafeReturnTo(typeof requested === 'string' ? requested : null)
    ? (requested as string)
    : landingFor(user.role)

  redirect(target)
}

/** Each role has exactly one home. Sending everyone to / and letting them navigate is
 *  how staff end up bookmarking the student view. */
function landingFor(role: (typeof users.$inferSelect)['role']): string {
  switch (role) {
    case 'student':
      return '/my'
    case 'institution_admin':
      return '/admin'
    default:
      return '/staff'
  }
}
