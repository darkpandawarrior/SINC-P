import { CSRF_FIELD, readCsrfToken } from '@/lib/auth/csrf'

/**
 * The hidden CSRF field, in one place for the whole app.
 *
 * This used to be three identical copies, one per route group, and the officer console
 * had none — so grievance transitions, assignment, remarks and bulk triage, the most
 * sensitive mutations in the product, shipped without the double-submit defence every
 * other vertical had. A per-vertical copy is exactly how one vertical ends up missing.
 */
export async function CsrfField() {
  const token = await readCsrfToken()
  return <input type="hidden" name={CSRF_FIELD} value={token} />
}
