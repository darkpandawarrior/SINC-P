/**
 * The one place the officer console turns a session into an Actor. Every server
 * action and page in this vertical calls this rather than reading
 * session.user.institutionId itself — session.institutionId (not session.user's own
 * column) is the source of truth for which tenant a request is scoped to, and getting
 * that wrong here would be a cross-tenant bug no policy.ts check catches, because
 * policy.ts trusts whatever Actor it's handed.
 */
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { isStaff, type Actor } from '@/lib/grievance/policy'

export async function requireStaffActor(): Promise<Actor> {
  const session = await getSession()
  if (!session) redirect('/login?next=/staff')
  if (!isStaff(session.user.role)) redirect('/')
  return { id: session.user.id, role: session.user.role, institutionId: session.institutionId }
}
