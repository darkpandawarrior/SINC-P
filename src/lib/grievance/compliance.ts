/**
 * Compliance-report math for /staff/compliance — the screen that gets screenshotted
 * into a NAAC self-study report. Kept pure and DB-free (same split as sla.ts) so the
 * numbers a Registrar quotes to an inspection committee are unit-testable without a
 * database in the loop.
 *
 * "Breached" here means something different from sla.ts's `slaState`: that module
 * answers "is the clock still ticking on this grievance right now" for a live queue.
 * This module answers a retrospective question — "did we, in fact, miss the deadline"
 * — which for a closed grievance depends on when it actually finished, not on `now`.
 */
import type { Category, Grievance } from '@/db/schema'
import { isOpen, TERMINAL_STATUSES } from './policy'

const DAY_MS = 86_400_000

export interface CategoryStat {
  categoryId: string | null
  categoryName: string
  count: number
  medianResolutionDays: number | null
  breached: number
}

export interface AgeingBucket {
  label: string
  maxDays: number
  count: number
}

export interface ComplianceStats {
  cycleStart: Date
  cycleEnd: Date
  totalFiled: number
  totalOpen: number
  breachedCount: number
  appealRate: number
  ageingBuckets: AgeingBucket[]
  byCategory: CategoryStat[]
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** resolvedAt is when the officer's work finished; closedAt (set for every terminal
 *  status) is the fallback for statuses that never pass through 'resolved' — rejected
 *  and withdrawn have no resolution, so they contribute no resolution-time sample. */
function resolutionDays(g: Pick<Grievance, 'createdAt' | 'resolvedAt' | 'closedAt'>): number | null {
  const finishedAt = g.resolvedAt ?? g.closedAt
  if (!finishedAt) return null
  return (finishedAt.getTime() - g.createdAt.getTime()) / DAY_MS
}

/** A grievance "breached" if it finished after its due date, or is still open past it.
 *  Withdrawn/rejected grievances never had a resolution to be late with — the student
 *  or the institution took the case off the clock, that isn't a missed deadline. */
export function wasBreached(
  g: Pick<Grievance, 'status' | 'dueAt' | 'resolvedAt' | 'closedAt'>,
  now: Date,
): boolean {
  if (!g.dueAt) return false
  const finishedAt = g.resolvedAt ?? g.closedAt
  if (finishedAt) return finishedAt.getTime() > g.dueAt.getTime()
  if (g.status === 'rejected' || g.status === 'withdrawn') return false
  return now.getTime() > g.dueAt.getTime()
}

const AGEING_DEFS: ReadonlyArray<{ label: string; maxDays: number }> = [
  { label: '0–7 days', maxDays: 7 },
  { label: '8–15 days', maxDays: 15 },
  { label: '16–30 days', maxDays: 30 },
  { label: '30+ days', maxDays: Infinity },
]

/** Ageing of the currently-open queue, bucketed the way an accreditation report wants
 *  it — not a distribution of everything ever filed. */
export function ageingBuckets(
  items: readonly Pick<Grievance, 'status' | 'createdAt'>[],
  now: Date,
): AgeingBucket[] {
  const buckets = AGEING_DEFS.map((d) => ({ ...d, count: 0 }))
  for (const g of items) {
    if (!isOpen(g.status)) continue
    const ageDays = (now.getTime() - g.createdAt.getTime()) / DAY_MS
    const bucket = buckets.find((b) => ageDays <= b.maxDays)
    if (bucket) bucket.count += 1
  }
  return buckets
}

/** Appeals filed divided by decisions that could have been appealed. Appeal rows
 *  themselves (kind === 'appeal') are the numerator, never counted as a decision. */
export function appealRate(items: readonly Pick<Grievance, 'kind' | 'status'>[]): number {
  const appeals = items.filter((g) => g.kind === 'appeal').length
  const decided = items.filter(
    (g) => g.kind !== 'appeal' && (TERMINAL_STATUSES.includes(g.status) || g.status === 'appealed'),
  ).length
  return decided === 0 ? 0 : appeals / decided
}

export function categoryStats(
  items: readonly Pick<Grievance, 'categoryId' | 'createdAt' | 'resolvedAt' | 'closedAt' | 'status' | 'dueAt'>[],
  categoryRows: readonly Pick<Category, 'id' | 'name'>[],
  now: Date,
): CategoryStat[] {
  const nameById = new Map(categoryRows.map((c) => [c.id, c.name]))
  const byCategory = new Map<string | null, (typeof items)[number][]>()
  for (const g of items) {
    const rows = byCategory.get(g.categoryId) ?? []
    rows.push(g)
    byCategory.set(g.categoryId, rows)
  }

  return [...byCategory.entries()]
    .map(([categoryId, rows]) => ({
      categoryId,
      categoryName: categoryId ? (nameById.get(categoryId) ?? 'Unknown category') : 'Uncategorised',
      count: rows.length,
      medianResolutionDays: median(rows.map(resolutionDays).filter((d): d is number => d !== null)),
      breached: rows.filter((g) => wasBreached(g, now)).length,
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Only the seven columns this function reads.
 *
 * Named explicitly so the query can project them. Selecting whole rows pulled `subject`
 * and `body` for every grievance in the reporting window, and `body` is up to 8000
 * characters. For an institution with a year of grievances that is megabytes over the
 * wire and through the JSON parser, to compute counts and medians that never look at
 * either column.
 */
export type ComplianceRow = Pick<
  Grievance,
  'categoryId' | 'closedAt' | 'createdAt' | 'dueAt' | 'kind' | 'resolvedAt' | 'status'
>

export function buildComplianceStats(
  items: readonly ComplianceRow[],
  categoryRows: readonly Pick<Category, 'id' | 'name'>[],
  cycleStart: Date,
  cycleEnd: Date,
  now: Date,
): ComplianceStats {
  return {
    cycleStart,
    cycleEnd,
    totalFiled: items.length,
    totalOpen: items.filter((g) => isOpen(g.status)).length,
    breachedCount: items.filter((g) => wasBreached(g, now)).length,
    appealRate: appealRate(items),
    ageingBuckets: ageingBuckets(items, now),
    byCategory: categoryStats(items, categoryRows, now),
  }
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** The compliance page's CSV export. One flat file — summary block, blank line,
 *  per-category table, blank line, ageing table — rather than three downloads, because
 *  a Registrar pastes this straight into one Excel sheet for the self-study annexe. */
export function complianceCsv(stats: ComplianceStats): string {
  const lines: string[][] = [
    ['Cycle', `${stats.cycleStart.toISOString().slice(0, 10)} to ${stats.cycleEnd.toISOString().slice(0, 10)}`],
    ['Total filed', String(stats.totalFiled)],
    ['Total open', String(stats.totalOpen)],
    ['Breached this cycle', String(stats.breachedCount)],
    ['Appeal rate', `${(stats.appealRate * 100).toFixed(1)}%`],
    [],
    ['Category', 'Count', 'Median resolution (days)', 'Breached'],
    ...stats.byCategory.map((c) => [
      c.categoryName,
      String(c.count),
      c.medianResolutionDays === null ? '' : c.medianResolutionDays.toFixed(1),
      String(c.breached),
    ]),
    [],
    ['Ageing bucket', 'Open grievances'],
    ...stats.ageingBuckets.map((b) => [b.label, String(b.count)]),
  ]
  return lines.map((row) => row.map(csvEscape).join(',')).join('\n')
}
