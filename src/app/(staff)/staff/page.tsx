import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { CsrfField } from '@/components/CsrfField'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { SlaBadge } from '@/components/ui/SlaBadge'
import { StatusPill } from '@/components/ui/StatusPill'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import { buttonClasses } from '@/components/ui/Button'
import { isOpen, type Status } from '@/lib/grievance/policy'
import { listAssignableStaff, listCategories, listQueue, type QueueFilters } from '@/lib/grievance/service'
import { requireStaffActor } from '../_lib/actor'
import { STATUS_LABELS } from '../_lib/status-labels'
import { bulkAssignAction, bulkTransitionAction } from './actions'

export const metadata = { title: 'Queue — SINC-P' }

// Staff-drivable target statuses only (TRANSITION_ROLES in policy.ts reserves
// closed/withdrawn/appealed for the filing student) — offering the rest here would
// just fill the "failed" bucket of every bulk transition with wrong-role denials.
const BULK_STATUSES: readonly Status[] = ['under_review', 'in_progress', 'resolved', 'rejected']
const BULK_STATUS_OPTIONS = BULK_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))

const ALL_STATUSES = Object.keys(STATUS_LABELS) as Status[]
const STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Open (default)' },
  { value: 'all', label: 'All statuses' },
  ...ALL_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
]

const SLA_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Any SLA state' },
  { value: 'breached', label: 'Breached' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'on_track', label: 'On track' },
]

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function StaffQueuePage({ searchParams }: PageProps) {
  const actor = await requireStaffActor()
  const sp = await searchParams

  const statusParam = first(sp.status)
  const categoryId = first(sp.category) || undefined
  const assigneeParam = first(sp.assignee) as QueueFilters['assignee'] | ''
  const slaParam = first(sp.sla) as QueueFilters['slaState'] | ''
  const page = Number(first(sp.page) || '1') || 1
  const bulkOk = first(sp.bulkOk)
  const bulkFailed = first(sp.bulkFailed)

  const filters: QueueFilters = {
    status: statusParam === 'all' ? ALL_STATUSES : statusParam ? [statusParam as Status] : undefined,
    categoryId,
    assignee: assigneeParam || undefined,
    slaState: slaParam || undefined,
    page,
  }

  const [categoriesList, staffList, queue] = await Promise.all([
    listCategories(actor),
    listAssignableStaff(actor),
    listQueue(actor, filters),
  ])

  const categoryName = new Map(categoriesList.map((c) => [c.id, c.name]))
  const staffName = new Map(staffList.map((s) => [s.id, s.fullName]))

  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(queue.total / pageSize))

  // Every control below is a real GET query param, so the filtered, sorted queue is a
  // bookmarkable, back-button-safe URL — no client state to lose on a refresh.
  const query = new URLSearchParams()
  if (statusParam) query.set('status', statusParam)
  if (categoryId) query.set('category', categoryId)
  if (assigneeParam) query.set('assignee', assigneeParam)
  if (slaParam) query.set('sla', slaParam)
  const baseQuery = query.toString()
  const returnTo = `/staff${baseQuery ? `?${baseQuery}` : ''}`

  const buildPageHref = (p: number) => {
    const q = new URLSearchParams(query)
    q.set('page', String(p))
    return `/staff?${q.toString()}`
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-fg">Queue</h1>

      {bulkOk && (
        <Alert
          variant={bulkFailed && Number(bulkFailed) > 0 ? 'warning' : 'success'}
          title={
            bulkFailed && Number(bulkFailed) > 0
              ? `${bulkOk} updated, ${bulkFailed} skipped`
              : `${bulkOk} grievance${bulkOk === '1' ? '' : 's'} updated`
          }
        >
          {bulkFailed && Number(bulkFailed) > 0
            ? "Skipped rows weren't visible to you or didn't allow that change."
            : undefined}
        </Alert>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <FilterSelect name="status" label="Status" defaultValue={statusParam} options={STATUS_FILTER_OPTIONS} />
        <FilterSelect
          name="category"
          label="Category"
          defaultValue={categoryId ?? ''}
          options={[{ value: '', label: 'All categories' }, ...categoriesList.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <FilterSelect
          name="assignee"
          label="Assignee"
          defaultValue={assigneeParam ?? ''}
          options={[
            { value: '', label: 'Anyone' },
            { value: 'me', label: 'Assigned to me' },
            { value: 'unassigned', label: 'Unassigned' },
            ...staffList.map((s) => ({ value: s.id, label: s.fullName })),
          ]}
        />
        <FilterSelect name="sla" label="SLA state" defaultValue={slaParam ?? ''} options={SLA_FILTER_OPTIONS} />
        <button type="submit" className={buttonClasses('secondary', 'sm')}>
          Apply
        </button>
        {baseQuery && (
          <Link href="/staff" className={buttonClasses('ghost', 'sm')}>
            Reset
          </Link>
        )}
      </form>

      {queue.items.length === 0 ? (
        <EmptyState title="Nothing in the queue" description="No grievances match these filters." />
      ) : (
        // One form, two destinations: the "Assign" and "Move" buttons below both submit
        // this same checkbox selection, each to its own Server Action via `formAction` —
        // the native way to offer more than one submit behaviour without client state
        // or duplicating the row markup into two forms.
        <form action={bulkAssignAction} className="flex flex-col gap-3">
          {/* bulkTransitionAction is a formAction button inside this same form, so it
              is covered by this one field. */}
          <CsrfField />
          <input type="hidden" name="returnTo" value={returnTo} />
          <Table>
            <Thead>
              <Tr>
                <Th className="w-8">
                  <span className="sr-only">Select</span>
                </Th>
                <Th>Reference</Th>
                <Th>Subject</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th>SLA</Th>
                <Th>Assignee</Th>
                <Th>Age</Th>
              </Tr>
            </Thead>
            <Tbody>
              {queue.items.map((g) => (
                <Tr key={g.id}>
                  <Td>
                    <input type="checkbox" name="grievanceIds" value={g.id} aria-label={`Select ${g.reference}`} />
                  </Td>
                  <Td>
                    <Link href={`/staff/grievances/${g.id}`} className="font-medium text-accent hover:underline">
                      {g.reference}
                    </Link>
                  </Td>
                  <Td className="max-w-xs truncate">{g.subject}</Td>
                  <Td className="text-fg-muted">{g.categoryId ? (categoryName.get(g.categoryId) ?? '—') : '—'}</Td>
                  <Td>
                    <StatusPill status={g.status} />
                  </Td>
                  <Td>
                    <SlaBadge grievance={g} />
                  </Td>
                  <Td className="text-fg-muted">{g.assignedToId ? (staffName.get(g.assignedToId) ?? '—') : 'Unassigned'}</Td>
                  <Td className="text-fg-muted">{daysSince(g.createdAt)}d</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
            <span className="text-xs font-medium text-fg-muted">Bulk actions on selected rows:</span>
            <select name="assigneeId" className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg" defaultValue="">
              <option value="" disabled>
                Assign to…
              </option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
            <button type="submit" formAction={bulkAssignAction} className={buttonClasses('secondary', 'sm')}>
              Assign
            </button>

            <span aria-hidden className="mx-1 h-5 w-px bg-border" />

            <select name="status" className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg" defaultValue="">
              <option value="" disabled>
                Move to…
              </option>
              {BULK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button type="submit" formAction={bulkTransitionAction} className={buttonClasses('secondary', 'sm')}>
              Move
            </button>
          </div>
        </form>
      )}

      <Pagination page={page} totalPages={totalPages} buildHref={buildPageHref} />
    </div>
  )
}

function FilterSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string
  label: string
  defaultValue: string
  options: readonly { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
