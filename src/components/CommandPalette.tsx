'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  AlarmClock,
  BarChart3,
  BookOpen,
  FilePlus2,
  Inbox,
  Megaphone,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react'

/**
 * Command palette, on the key everyone already presses.
 *
 * The officer console's real user opens it forty times a day and knows exactly where
 * they are going. Making them travel through a nav to get there is the difference
 * between a tool and a website, and the council's highest-probability failure was that
 * the Registrar's day gets worse rather than better.
 *
 * It navigates and toggles the theme. It cannot change a grievance: a keyboard shortcut
 * that resolves a case is a keyboard shortcut that resolves the wrong case eventually,
 * and every mutation in this product is a deliberate act with a confirmation and an
 * audit entry behind it.
 *
 * The whole thing is progressive enhancement. With JavaScript off there is no palette
 * and every destination is still reachable from an ordinary link.
 */

interface Item {
  label: string
  hint?: string
  href?: string
  action?: 'toggle-theme'
  icon: typeof Inbox
  keywords?: string
}

const STAFF: Item[] = [
  { label: 'Queue', hint: 'What breaches soonest', href: '/staff', icon: Inbox, keywords: 'cases grievances list' },
  { label: 'Compliance dashboard', hint: 'Medians, breaches, export', href: '/staff/compliance', icon: BarChart3, keywords: 'naac report audit export' },
]

const CAMPUS: Item[] = [
  { label: 'Announcements', href: '/news', icon: Megaphone, keywords: 'news notices' },
  { label: 'Handbook', href: '/handbook', icon: BookOpen, keywords: 'faq answers policy' },
  { label: 'Disclosures', href: '/disclosures', icon: ShieldCheck, keywords: 'sgrc ombudsperson statutory ugc' },
  { label: 'Transparency', href: '/transparency', icon: BarChart3, keywords: 'closure times public median' },
]

const STUDENT: Item[] = [
  { label: 'My grievances', href: '/my', icon: Inbox, keywords: 'mine track status' },
  { label: 'File a grievance', href: '/my/new', icon: FilePlus2, keywords: 'new complaint raise submit' },
  { label: 'Check status by reference', href: '/status', icon: Search, keywords: 'lookup reference number' },
]

const ADMIN: Item[] = [
  { label: 'Users and roles', href: '/admin/users', icon: Users, keywords: 'invite staff officer' },
  { label: 'Categories and SLA', href: '/admin/categories', icon: AlarmClock, keywords: 'taxonomy deadline override' },
  { label: 'Institution settings', href: '/admin/settings', icon: Settings, keywords: 'anonymous domain window' },
  { label: 'Security log', href: '/admin/security', icon: ShieldCheck, keywords: 'auth events denials' },
]

export function CommandPalette({ role }: { role?: string }) {
  const [open, setOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setIsDark(document.documentElement.dataset.theme === 'dark')
    const onKey = (e: KeyboardEvent) => {
      // Cmd+K on a Mac, Ctrl+K everywhere else. Both, because a Registrar's office runs
      // Windows and the person demoing it is on a Mac.
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('sincp-theme', next)
    } catch {
      // Private browsing blocks localStorage. The toggle still works for this page.
    }
    setIsDark(next === 'dark')
  }

  function run(item: Item) {
    setOpen(false)
    if (item.action === 'toggle-theme') return toggleTheme()
    if (item.href) router.push(item.href)
  }

  const groups: Array<{ heading: string; items: Item[] }> = []
  if (role && role !== 'student') groups.push({ heading: 'Officer console', items: STAFF })
  if (role === 'student') groups.push({ heading: 'Your grievances', items: STUDENT })
  if (role === 'institution_admin') groups.push({ heading: 'Administration', items: ADMIN })
  groups.push({ heading: 'Campus', items: CAMPUS })
  if (!role) groups.push({ heading: 'Your grievances', items: STUDENT })
  groups.push({
    heading: 'Appearance',
    items: [
      {
        label: isDark ? 'Switch to light theme' : 'Switch to dark theme',
        action: 'toggle-theme',
        icon: isDark ? Sun : Moon,
        keywords: 'dark light theme contrast',
      },
    ],
  })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lift hidden items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-muted sm:inline-flex"
        aria-label="Open command palette"
      >
        <Search aria-hidden className="size-3.5" />
        <span>Search</span>
        <kbd className="rounded border border-border bg-bg px-1 font-sans text-[10px]">⌘K</kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command palette"
        className="animate-overlay-in fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        // cmdk renders a dialog; the wrapper below is the visible panel.
      >
        <div className="animate-panel-in mx-auto mt-[12vh] w-[min(94vw,34rem)] overflow-hidden rounded-lg border border-border bg-surface shadow-overlay">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search aria-hidden className="size-4 text-fg-muted" />
            <Command.Input
              placeholder="Go to…"
              className="w-full bg-transparent py-3 text-sm text-fg outline-none placeholder:text-fg-muted"
            />
            <kbd className="rounded border border-border px-1 text-[10px] text-fg-muted">esc</kbd>
          </div>

          <Command.List className="max-h-[52vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-fg-muted">
              Nothing matches that.
            </Command.Empty>

            {groups.map((group) => (
              <Command.Group
                key={group.heading}
                heading={group.heading}
                className="px-1 py-1 text-[11px] font-medium text-fg-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
              >
                {group.items.map((item) => (
                  <Command.Item
                    key={item.label}
                    value={`${item.label} ${item.keywords ?? ''}`}
                    onSelect={() => run(item)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-fg data-[selected=true]:bg-accent-soft-bg data-[selected=true]:text-accent-soft-fg"
                  >
                    <item.icon aria-hidden className="size-4 shrink-0 opacity-70" />
                    <span>{item.label}</span>
                    {item.hint && (
                      <span className="ml-auto text-xs text-fg-muted">{item.hint}</span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </div>
      </Command.Dialog>
    </>
  )
}
