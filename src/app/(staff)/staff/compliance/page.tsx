import { Alert } from '@/components/ui/Alert'
import { buttonClasses } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import { complianceSnapshot } from '@/lib/grievance/service'
import { requireStaffActor } from '../../_lib/actor'

export const metadata = { title: 'Compliance — SINC-P' }

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** A bare UTC-midnight parse of an `<input type="date">` value — good enough for a
 *  report-window boundary (see complianceSnapshot's own ponytail note on cycle
 *  precision); an invalid or missing value falls through to the service's default. */
function parseDateParam(v: string): Date | undefined {
  if (!v) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export default async function CompliancePage({ searchParams }: PageProps) {
  const actor = await requireStaffActor()
  const sp = await searchParams
  const since = parseDateParam(first(sp.since))
  const until = parseDateParam(first(sp.until))

  const stats = await complianceSnapshot(actor, { since, until })

  if (!stats) {
    return (
      <Alert variant="danger" title="Not available">
        The compliance report is restricted to Moderators and Institution Admins.
      </Alert>
    )
  }

  const exportHref = `/staff/compliance/export?since=${isoDate(stats.cycleStart)}&until=${isoDate(stats.cycleEnd)}`
  const maxAgeing = Math.max(1, ...stats.ageingBuckets.map((b) => b.count))

  return (
    <div className="flex flex-col gap-6">
      {/* @page keeps the export to a clean A4 sheet — margins a Registrar's printer
          respects instead of the browser's own default header/footer band. */}
      <style>{'@media print { @page { size: A4; margin: 14mm; } }'}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-lg font-semibold text-fg">Compliance</h1>
        <div className="flex items-center gap-2">
          <a href={exportHref} className={buttonClasses('secondary', 'sm')}>
            Export CSV
          </a>
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3 print:hidden">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-fg-muted">From</span>
          <input
            type="date"
            name="since"
            defaultValue={isoDate(stats.cycleStart)}
            className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-fg-muted">To</span>
          <input
            type="date"
            name="until"
            defaultValue={isoDate(stats.cycleEnd)}
            className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg"
          />
        </label>
        <button type="submit" className={buttonClasses('secondary', 'sm')}>
          Apply
        </button>
      </form>

      <p className="text-xs text-fg-muted">
        Cycle: {isoDate(stats.cycleStart)} to {isoDate(stats.cycleEnd)}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Filed this cycle" value={String(stats.totalFiled)} />
        <StatTile label="Currently open" value={String(stats.totalOpen)} />
        <StatTile label="Breached this cycle" value={String(stats.breachedCount)} emphasis="danger" />
        <StatTile label="Appeal rate" value={`${(stats.appealRate * 100).toFixed(1)}%`} />
      </div>

      <Card>
        <CardHeader className="text-sm font-medium text-fg">Ageing of open grievances</CardHeader>
        <CardBody className="flex flex-col gap-2">
          {stats.ageingBuckets.map((b) => (
            <div key={b.label} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-fg-muted">{b.label}</span>
              <div className="h-3 flex-1 rounded-full bg-status-neutral-bg">
                <div
                  className="h-3 rounded-full bg-accent"
                  style={{ width: `${(b.count / maxAgeing) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-medium text-fg">{b.count}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="text-sm font-medium text-fg">By category</CardHeader>
        <CardBody className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Category</Th>
                <Th>Filed</Th>
                <Th>Median resolution</Th>
                <Th>Breached</Th>
              </Tr>
            </Thead>
            <Tbody>
              {stats.byCategory.map((c) => (
                <Tr key={c.categoryId ?? 'none'}>
                  <Td>{c.categoryName}</Td>
                  <Td>{c.count}</Td>
                  <Td>{c.medianResolutionDays === null ? '—' : `${c.medianResolutionDays.toFixed(1)} d`}</Td>
                  <Td>{c.breached}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  )
}

function StatTile({ label, value, emphasis }: { label: string; value: string; emphasis?: 'danger' }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        <span className={`text-2xl font-semibold ${emphasis === 'danger' ? 'text-status-danger-fg' : 'text-fg'}`}>{value}</span>
      </CardBody>
    </Card>
  )
}
