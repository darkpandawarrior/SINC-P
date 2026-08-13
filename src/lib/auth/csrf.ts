/**
 * CSRF protection: double-submit cookie.
 *
 * The cookie is httpOnly — browser JS can never read it — but a Server Component CAN
 * read it via next/headers `cookies()`, since httpOnly only restricts the *browser's*
 * JavaScript, not the server. So every form embeds the cookie's current value as a
 * hidden field, and the server action compares the two with constant-time safeEqual().
 * A cross-site attacker can make the browser send the cookie (that's the whole premise
 * of CSRF), but cannot read it to also forge a matching hidden field, so the two values
 * only ever agree on a same-site submission.
 *
 * The cookie itself is minted by middleware.ts on the first request that doesn't have
 * one — Server Components cannot set cookies during render, only Server Actions, Route
 * Handlers and middleware can.
 */
import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { safeEqual } from './session'

export const CSRF_COOKIE = 'sincp_csrf'
export const CSRF_FIELD = 'csrfToken'

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Read the token a Server Component should render into a hidden field. Never mutates
 *  cookies — middleware guarantees the cookie exists before any page renders it. */
export async function readCsrfToken(): Promise<string> {
  const jar = await cookies()
  return jar.get(CSRF_COOKIE)?.value ?? ''
}

/** Pure comparison, split out from the cookie plumbing so it's testable without a
 *  request context. */
export function tokensMatch(cookieValue: string | undefined, submitted: FormDataEntryValue | null): boolean {
  if (typeof submitted !== 'string' || submitted.length === 0) return false
  if (!cookieValue) return false
  return safeEqual(submitted, cookieValue)
}

/** Call at the top of every mutating server action, before touching the database. */
export async function isCsrfValid(formData: FormData): Promise<boolean> {
  const jar = await cookies()
  return tokensMatch(jar.get(CSRF_COOKIE)?.value, formData.get(CSRF_FIELD))
}
