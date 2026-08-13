import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, BookOpen, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { getSession } from '@/lib/auth/session'
import { isStaff } from '@/lib/grievance/policy'
import { listCategories } from '@/lib/grievance/service'
import { isStale, listAllHandbookEntriesForStaff, listPublishedHandbookEntries } from '@/lib/handbook/service'
import { getPublicInstitution } from '@/lib/stats'
import { markReviewedAction } from './actions'

export const metadata: Metadata = { title: 'Handbook — SINC-P' }

interface PageProps {
  searchParams: Promise<{ q?: string; category?: string }>
}

export default async function HandbookPage({ searchParams }: PageProps) {
  const { q, category } = await searchParams
  const [session, institution] = await Promise.all([getSession(), getPublicInstitution()])
  const staffActor =
    session && isStaff(session.user.role)
      ? { id: session.user.id, role: session.user.role, institutionId: session.institutionId }
      : null

  if (!institution) {
    return <EmptyState icon={BookOpen} title="Not configured yet" description="No institution is set up on this deployment." />
  }

  // listCategories only reads actor.institutionId (no role gate — see grievance/service.ts),
  // so an anonymous visitor's category filter dropdown can reuse it with a placeholder
  // identity rather than this vertical growing its own copy of the same query.
  const readActor = staffActor ?? { id: institution.id, role: 'student' as const, institutionId: institution.id }
  const [categories, { items }, staffEntries] = await Promise.all([
    listCategories(readActor),
    listPublishedHandbookEntries(institution.id, { q, categoryId: category }),
    staffActor ? listAllHandbookEntriesForStaff(staffActor) : Promise.resolve([]),
  ])
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div data-surface="public" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Handbook</h1>
          <p className="text-sm text-fg-muted">Answers to common questions before you file a grievance.</p>
        </div>
        {staffActor && (
          <Link href="/handbook/new" className={buttonClasses('primary')}>
            <Plus aria-hidden className="size-4" />
            New entry
          </Link>
        )}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-fg-muted">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Hostel, fees, exams…"
            className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-fg-muted">Category</span>
          <select
            name="category"
            defaultValue={category ?? ''}
            className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClasses('secondary', 'sm')}>
          <Search aria-hidden className="size-4" />
          Search
        </button>
        {(q || category) && (
          <Link href="/handbook" className={buttonClasses('ghost', 'sm')}>
            Reset
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No matching entries" description="Try a different search term or category." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((entry) => (
            <Card key={entry.id}>
              <CardBody className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  {entry.categoryId && <Badge variant="neutral">{categoryName.get(entry.categoryId) ?? 'Uncategorised'}</Badge>}
                </div>
                <Link href={`/handbook/${entry.slug}`} className="text-base font-semibold text-fg hover:text-accent">
                  {entry.question}
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {staffActor && (
        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">All entries (staff)</h2>
          <div className="flex flex-col gap-2">
            {staffEntries.map((entry) => (
              <Card key={entry.id}>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={entry.isPublished ? 'success' : 'neutralMuted'}>
                        {entry.isPublished ? 'Published' : 'Draft'}
                      </Badge>
                      {isStale(entry) && (
                        <Badge variant="warning" icon={<AlertTriangle aria-hidden className="size-3.5" />}>
                          Review overdue
                        </Badge>
                      )}
                    </div>
                    <Link href={`/handbook/${entry.slug}/edit`} className="text-sm font-medium text-fg hover:text-accent">
                      {entry.question}
                    </Link>
                  </div>
                  {!isStale(entry) && (
                    <form action={markReviewedAction.bind(null, entry.id)}>
                      <button type="submit" className={buttonClasses('ghost', 'sm')}>
                        Mark reviewed
                      </button>
                    </form>
                  )}
                  {isStale(entry) && (
                    <form action={markReviewedAction.bind(null, entry.id)}>
                      <button type="submit" className={buttonClasses('secondary', 'sm')}>
                        Confirm still accurate
                      </button>
                    </form>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
