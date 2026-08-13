import Link from 'next/link'
import { FilePlus2 } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { StatusPill } from '@/components/ui/StatusPill'
import { SlaBadge } from '@/components/ui/SlaBadge'
import { buttonClasses } from '@/components/ui/Button'
import { grievanceStatus } from '@/db/schema'
import { isOpen, type Status } from '@/lib/grievance/policy'
import { listCategories, listGrievances } from '@/lib/grievance/service'
import { requireStudentActor } from '../_lib/actor'
import { formatDate, NEXT_STEP_COPY } from '../_lib/status-copy'

const OPEN_STATUSES = (grievanceStatus.enumValues as Status[]).filter(isOpen)
const PAGE_SIZE = 20

export default async function MyGrievancesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>
}) {
  const { actor } = await requireStudentActor()
  const { tab, page: pageParam } = await searchParams
  const showAll = tab === 'all'
  const page = Math.max(1, Number(pageParam) || 1)

  const [categories, { items, total }] = await Promise.all([
    listCategories(actor),
    listGrievances(actor, { status: showAll ? undefined : OPEN_STATUSES, page, pageSize: PAGE_SIZE }),
  ])
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const tabClasses = (active: boolean) =>
    `border-b-2 px-1 pb-2 text-sm font-medium ${active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'}`

  return (
    <div data-surface="public" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-fg">My grievances</h1>
        <Link href="/my/new" className={buttonClasses('primary')}>
          <FilePlus2 aria-hidden className="size-4" />
          File a new grievance
        </Link>
      </div>

      <nav aria-label="Filter" className="flex gap-4 border-b border-border">
        <Link href="/my" className={tabClasses(!showAll)}>
          Active
        </Link>
        <Link href="/my?tab=all" className={tabClasses(showAll)}>
          All
        </Link>
      </nav>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={FilePlus2}
            title={showAll ? 'No grievances filed yet' : 'Nothing active right now'}
            description={
              showAll
                ? 'Once you file a grievance it will show up here, with its full trail.'
                : 'Every grievance you filed is either resolved, closed, or withdrawn.'
            }
            action={
              <Link href="/my/new" className={buttonClasses('secondary', 'sm')}>
                File a grievance
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((g) => (
            <li key={g.id}>
              <Link href={`/my/${g.reference}`} className="block">
                <Card className="transition-colors hover:border-border-strong">
                  <CardBody className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-fg-muted">{g.reference}</span>
                      <div className="flex items-center gap-2">
                        <StatusPill status={g.status} />
                        <SlaBadge grievance={g} />
                      </div>
                    </div>
                    <p className="font-medium text-fg">{g.subject}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                      <span>{g.categoryId ? (categoryName.get(g.categoryId) ?? 'Uncategorised') : 'Uncategorised'}</span>
                      <span aria-hidden>&middot;</span>
                      <span>Filed {formatDate(g.createdAt)}</span>
                    </div>
                    <p className="text-sm text-fg-muted">{NEXT_STEP_COPY[g.status]}</p>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        buildHref={(p) => `/my?${new URLSearchParams({ ...(showAll ? { tab: 'all' } : {}), page: String(p) })}`}
      />
    </div>
  )
}
