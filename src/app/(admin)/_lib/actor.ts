/**
 * Institution admin gate. `institution_admin` is a staff role (isStaff includes it) but
 * this vertical is narrower than "staff" — a moderator or redressal officer must bounce
 * here the same as a student, so this checks the exact role rather than importing
 * isStaff from policy.ts. admin/service.ts's own `requireInstitutionAdmin` is the real
 * enforcement (Server Actions are POST-reachable directly); this is the route-level
 * layer that keeps a wrong role from ever seeing the console's UI in the first place.
 */
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import type { Actor } from '@/lib/grievance/policy'

export async function requireAdminActor(returnTo: string): Promise<Actor & { fullName: string }> {
  const session = await getSession()
  if (!session) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  if (session.user.role !== 'institution_admin') redirect('/')
  return {
    id: session.user.id,
    role: session.user.role,
    institutionId: session.institutionId,
    fullName: session.user.fullName,
  }
}
