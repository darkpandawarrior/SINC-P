import type { Metadata } from 'next'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table'
import { getPublicInstitution, getTransparencyStats } from '@/lib/stats'
import { CategoryBarChart, TrendLineChart } from './charts'

export const metadata: Metadata = {
  title: 'SINC-P — Transparency',
  description: 'Anonymised, aggregated grievance closure statistics.',
}

function formatDays(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)} days`
}

function formatCount(v: number | null): string {
  return v === null ? '—' : String(v)
}

function formatPercent(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`
}

export default async function TransparencyPage() {
  const institution = await getPublicInstitution()
  if (!institution) {
    return <EmptyState title="Not configured yet" description="No institution is set up on this deployment." />
  }

  const stats = await getTransparencyStats(institution.id)

  return (
    <div data-surface="public" className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-fg">Transparency — {institution.name}</h1>
        <p className="max-w-2xl text-fg-muted">
          Anonymised and aggregated grievance data, published without a login. No individual
          grievance or identity appears anywhere on this page. Any figure that would be computed
          from fewer than 5 grievances is withheld — shown as &ldquo;—&rdquo; — because a count that
          small can identify the person who filed it.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-fg">Grievances filed</h2>
          </CardHeader>
          <CardBody>
            <p className="text-3xl font-semibold text-fg">{stats.totalFiled}</p>
            <p className="text-sm text-fg-muted">all-time, this institution</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-fg">Resolved inside the statutory window</h2>
          </CardHeader>
          <CardBody>
            <p className="text-3xl font-semibold text-fg">{formatPercent(stats.overallWithinWindowRate)}</p>
            <p className="text-sm text-fg-muted">of grievances that have reached a resolution</p>
          </CardBody>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-fg">Volume and closure time by category</h2>
        <CategoryBarChart
          unit=" filed"
          data={stats.categories.map((c) => ({ label: c.categoryName, value: c.filedCount }))}
        />
        <Table>
          <Thead>
            <Tr>
              <Th>Category</Th>
              <Th>Grievances filed</Th>
              <Th>Median days to resolution</Th>
            </Tr>
          </Thead>
          <Tbody>
            {stats.categories.map((c) => (
              <Tr key={c.categoryId}>
                <Td>{c.categoryName}</Td>
                <Td>{formatCount(c.filedCount)}</Td>
                <Td>{formatDays(c.medianResolutionDays)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-fg">Trend, last 6 months</h2>
        <TrendLineChart
          unit="grievances filed"
          points={stats.trend.map((p) => ({ label: p.month, value: p.filedCount }))}
        />
        <Table>
          <Thead>
            <Tr>
              <Th>Month</Th>
              <Th>Filed</Th>
              <Th>Median days to resolution</Th>
              <Th>Resolved within window</Th>
            </Tr>
          </Thead>
          <Tbody>
            {stats.trend.map((p) => (
              <Tr key={p.month}>
                <Td>{p.month}</Td>
                <Td>{formatCount(p.filedCount)}</Td>
                <Td>{formatDays(p.medianResolutionDays)}</Td>
                <Td>{formatPercent(p.withinWindowRate)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </section>
    </div>
  )
}
