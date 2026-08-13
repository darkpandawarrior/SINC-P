import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { isStaff } from '@/lib/grievance/policy'
import { ROLE_LABELS } from './_lib/role-labels'

/**
 * The one auth gate for the whole officer console. A student who guesses /staff/...
 * gets bounced here, at the layout — not re-checked (or worse, forgotten) on every
 * page underneath it. That's the 2019 IDOR class of bug at the route level instead of
 * the query-string level; policy.ts's canView still gates each individual grievance.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login?next=/staff')
  if (!isStaff(session.user.role)) redirect('/')

  const canSeeCompliance = session.user.role === 'institution_admin' || session.user.role === 'moderator'

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Officer console" className="flex items-center gap-1 border-b border-border print:hidden">
        <StaffNavLink href="/staff">Queue</StaffNavLink>
        {canSeeCompliance && <StaffNavLink href="/staff/compliance">Compliance</StaffNavLink>}
        <span className="ml-auto text-xs text-fg-muted">
          {session.user.fullName} · {ROLE_LABELS[session.user.role]}
        </span>
      </nav>
      {children}
    </div>
  )
}

function StaffNavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-fg-muted hover:border-border-strong hover:text-fg"
    >
      {children}
    </Link>
  )
}
