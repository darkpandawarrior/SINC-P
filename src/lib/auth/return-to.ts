/**
 * `returnTo` safety.
 *
 * middleware.ts builds this query param when it bounces an unauthenticated request to
 * /login; loginAction reads it back after a successful login. Both ends must agree it is
 * a same-site relative path — an open redirect here would turn "log in to SINC-P" into a
 * ready-made phishing link (login on the real site, land on an attacker's page that asks
 * you to "confirm" your password again).
 */
export function isSafeReturnTo(value: string | null | undefined): value is string {
  if (!value) return false
  // A leading "//" or "/\" is browser-parsed as protocol-relative — off-site despite
  // starting with a slash. A literal "://" anywhere (e.g. "/x?u=https://evil") is the
  // same trick one level down.
  if (!value.startsWith('/')) return false
  if (value.startsWith('//') || value.startsWith('/\\')) return false
  if (value.includes('://')) return false
  return true
}
