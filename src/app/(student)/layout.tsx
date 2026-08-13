import type { ReactNode } from 'react'
import Link from 'next/link'
import { requireStudentActor } from './_lib/actor'

/**
 * Guards the whole student vertical in one place — every page under (student)/** renders
 * behind this, so there is no route someone can add later and forget the session check
 * on. That forgetting is the exact shape of the 2019 IDOR this rebuild exists to close.
 */
export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { fullName } = await requireStudentActor()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <nav aria-label="Your grievances" className="flex items-center gap-4 text-sm font-medium">
          <Link href="/my" className="text-fg hover:text-accent">
            My grievances
          </Link>
          <Link href="/my/new" className="text-fg hover:text-accent">
            File a new grievance
          </Link>
        </nav>
        <p className="text-sm text-fg-muted">{fullName}</p>
      </div>
      {children}
    </div>
  )
}
