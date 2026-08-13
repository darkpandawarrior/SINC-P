import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'SINC-P — Grievance Redressal',
  description:
    'Statutory grievance redressal for Indian higher education institutions, built to UGC (Redressal of Grievances of Students) Regulations.',
}

/**
 * The shared chrome for both the public site and the authenticated app. Header/footer
 * stay deliberately generic here — no session lookup, no role-aware nav — so the
 * public pages don't pay for an auth check they don't need. Authenticated areas add
 * their own nav inside their own route-group layout, nested under this one.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-base font-semibold text-fg">
              SINC-P
              <span className="ml-2 text-sm font-normal text-fg-muted">Grievance Redressal</span>
            </Link>
          </div>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>

        <footer className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-fg-muted">
            SINC-P — built to the UGC (Redressal of Grievances of Students) Regulations, 2023.
          </div>
        </footer>
      </body>
    </html>
  )
}
