/**
 * News and the handbook are public reading surfaces — most of this vertical needs no
 * session at all. This guard exists only for the staff-only sub-pages nested under it
 * (compose, edit, publish): the same "gate at the point of use, not by assuming a
 * layout already checked" shape as (student)/_lib/actor.ts and (staff)/_lib/actor.ts,
 * since neither of those layouts covers routes under (campus).
 */
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { isStaff, type Actor } from '@/lib/grievance/policy'

export async function requireStaffActor(returnTo: string): Promise<Actor> {
  const session = await getSession()
  if (!session) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  // A student who guesses /news/new gets sent to the public list, not a 403 page — the
  // same "just go home" shape the officer console uses for a role it doesn't cover.
  if (!isStaff(session.user.role)) redirect('/news')
  return { id: session.user.id, role: session.user.role, institutionId: session.institutionId }
}
