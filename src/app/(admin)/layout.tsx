import type { ReactNode } from 'react'
import Link from 'next/link'
import { requireAdminActor } from './_lib/actor'

/**
 * The one auth gate for the whole admin console — same shape as (staff)/layout.tsx and
 * (student)/layout.tsx: check once here, not on every page underneath, so a route added
 * later can't forget it.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { fullName } = await requireAdminActor('/admin')

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Institution admin" className="flex items-center gap-1 border-b border-border print:hidden">
        <AdminNavLink href="/admin/users">Users</AdminNavLink>
        <AdminNavLink href="/admin/categories">Categories</AdminNavLink>
        <AdminNavLink href="/admin/settings">Settings</AdminNavLink>
        <AdminNavLink href="/admin/security">Security</AdminNavLink>
        <span className="ml-auto text-xs text-fg-muted">{fullName} · Institution Admin</span>
      </nav>
      {children}
    </div>
  )
}

function AdminNavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-fg-muted hover:border-border-strong hover:text-fg"
    >
      {children}
    </Link>
  )
}
