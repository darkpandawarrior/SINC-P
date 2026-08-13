import type { ReactNode } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/transparency', label: 'Transparency' },
  { href: '/disclosures', label: 'Disclosures' },
  { href: '/status', label: 'Check status' },
] as const

/**
 * Nav for the unauthenticated public site only, nested under the root layout's generic
 * chrome per that file's own comment. "Sign in" is the one authenticated-area link this
 * layout carries — assumed at /login, owned by whichever vertical builds the auth pages.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Public site" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-3 text-sm">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="font-medium text-fg hover:text-accent">
            {link.label}
          </Link>
        ))}
        <Link href="/login" className="ml-auto font-medium text-accent hover:text-accent-hover">
          Sign in
        </Link>
      </nav>
      {children}
    </div>
  )
}
