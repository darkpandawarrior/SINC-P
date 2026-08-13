import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Toaster } from 'sonner'
import { CommandPalette } from '@/components/CommandPalette'
import { ThemeScript } from '@/components/ThemeScript'
import { getSession } from '@/lib/auth/session'
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
export default async function RootLayout({ children }: { children: ReactNode }) {
  // One session read for the whole tree, used only to decide which commands the palette
  // offers. Every route group still runs its own guard: this is a nav convenience, never
  // an authorisation decision.
  const session = await getSession().catch(() => null)

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="group text-base font-semibold text-fg">
              SINC-P
              <span className="ml-2 text-sm font-normal text-fg-muted">Grievance Redressal</span>
            </Link>
            <CommandPalette role={session?.user.role} />
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

        {/* Action feedback. Server Actions redirect with a query flag and the page reads
            it; this is for the client-side confirmations that have no redirect. */}
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: 'text-sm',
            style: {
              background: 'var(--color-surface)',
              color: 'var(--color-fg)',
              border: '1px solid var(--color-border)',
            },
          }}
        />
      </body>
    </html>
  )
}
