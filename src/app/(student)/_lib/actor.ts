/**
 * Every page in this route group needs the same three things before it renders
 * anything: a real session, a student role, and an Actor shaped for the service layer.
 * One helper so that guard can't be forgotten on a new page the way the 2019 code
 * forgot it on every page but login.php.
 */
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import type { Actor } from '@/lib/grievance/policy'

export interface StudentContext {
  actor: Actor
  fullName: string
}

export async function requireStudentActor(returnTo?: string): Promise<StudentContext> {
  const session = await getSession()
  if (!session) {
    const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''
    redirect(`/login${qs}`)
  }
  // Other roles have their own consoles; this route group only ever renders the
  // filer's-eye view, so a staff account landing here by URL guess goes home instead.
  if (session.user.role !== 'student') {
    redirect('/')
  }

  return {
    actor: { id: session.user.id, role: session.user.role, institutionId: session.institutionId },
    fullName: session.user.fullName,
  }
}
