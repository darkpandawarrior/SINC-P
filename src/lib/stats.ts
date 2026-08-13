/**
 * Public transparency aggregates.
 *
 * This is the counter-pull the ADR calls out: without published closure-time stats the
 * grievance register stays empty and the compliance record is a fiction. Everything
 * here is anonymised and aggregated — no individual grievance, no identity, ever.
 *
 * `suppressSmallCell` is the one rule the rest of this module exists to serve. A
 * department with a single complaint is re-identifiable from the count alone — a DPDP
 * problem and a betrayal of whoever filed it. Enforced here, in the query/compute layer,
 * not in the page component: a suppressed cell that never leaves this file cannot leak
 * through a view that forgets to check it.
 *
 * The compute functions (computeCategoryStats, computeOverallWithinWindowRate,
 * computeTrend) are pure — they take already-loaded rows and do no I/O — so the
 * suppression rule and the aggregation maths are unit-testable without a live Postgres.
 * getTransparencyStats is the only impure entry point; it just loads rows and hands them
 * to the pure functions.
 */
import { and, eq } from 'drizzle-orm'
import { withTenant, withoutTenantScope } from '@/db/client'
import { categories, grievances, institutions, type Institution } from '@/db/schema'

/** Below this, a value derived from a count is not published — small enough that a
 *  department head or classmate could plausibly match it to one person. */
export const MIN_CELL_SIZE = 5

/**
 * The one suppression rule. `count` is always the number of underlying grievances the
 * value was computed from, never the value itself — a median of 3 days computed from 3
 * grievances suppresses because there were 3 grievances, not because 3 is a small
 * number of days.
 */
export function suppressSmallCell<T>(count: number, value: T): T | null {
  return count < MIN_CELL_SIZE ? null : value
}

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length
  const mid = Math.floor(n / 2)
  return n % 2 === 0 ? (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2 : sortedAsc[mid]!
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000
}

// ---------------------------------------------------------------------------
// Institution resolution
// ---------------------------------------------------------------------------

/**
 * The public site is scoped to one institution. `institutions` carries no
 * institutionId of its own — it IS the tenant root — so resolving it needs the
 * cross-tenant escape hatch, same as login/signup do.
 *
 * ponytail: picks the earliest-created row. Production is one college per Docker
 * Compose deployment (docs/deployment.md) — there's only ever one row, so "earliest"
 * is really "the only one". The seed's two institutions exist to prove RLS in tests,
 * not to be browsed publicly. Upgrade to host-based resolution the day a hosted
 * multi-institution deployment goes live behind one domain.
 */
export async function getPublicInstitution(): Promise<Institution | null> {
  const rows = await withoutTenantScope('public site: resolve the deployment institution', (tx) =>
    tx.select().from(institutions).orderBy(institutions.createdAt).limit(1),
  )
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Pure aggregation
// ---------------------------------------------------------------------------

export interface RawGrievance {
  categoryId: string | null
  createdAt: Date
  resolvedAt: Date | null
  dueAt: Date | null
}

export interface CategoryMeta {
  id: string
  name: string
}

export interface CategoryStat {
  categoryId: string
  categoryName: string
  filedCount: number | null
  medianResolutionDays: number | null
}

export interface MonthPoint {
  /** YYYY-MM, bucketed on the UTC calendar. A trend chart tolerates the IST/UTC seam
   *  sla.ts's due-date maths carefully guards against — nothing here drives a
   *  statutory deadline, so a day of slack at a month boundary costs nothing. */
  month: string
  filedCount: number | null
  medianResolutionDays: number | null
  withinWindowRate: number | null
}

export interface TransparencyStats {
  totalFiled: number
  overallWithinWindowRate: number | null
  categories: CategoryStat[]
  trend: MonthPoint[]
}

/** Per-category volume and median days-to-resolution, each cell suppressed on its own
 *  underlying count — a category's filed count and its resolved-subset count are
 *  different denominators, so they're suppressed independently. */
export function computeCategoryStats(rows: RawGrievance[], cats: CategoryMeta[]): CategoryStat[] {
  return cats.map((cat) => {
    const inCategory = rows.filter((r) => r.categoryId === cat.id)
    const resolvedDays = inCategory
      .filter((r) => r.resolvedAt !== null)
      .map((r) => daysBetween(r.createdAt, r.resolvedAt!))
      .sort((a, b) => a - b)

    return {
      categoryId: cat.id,
      categoryName: cat.name,
      filedCount: suppressSmallCell(inCategory.length, inCategory.length),
      medianResolutionDays: suppressSmallCell(resolvedDays.length, resolvedDays.length ? median(resolvedDays) : 0),
    }
  })
}

/** Institution-wide share of ever-resolved grievances that met their statutory due
 *  date. Only grievances that both have a due date and were actually resolved count
 *  toward the denominator — an open grievance hasn't missed anything yet. */
export function computeOverallWithinWindowRate(rows: RawGrievance[]): number | null {
  const judged = rows.filter((r) => r.resolvedAt !== null && r.dueAt !== null)
  const withinWindow = judged.filter((r) => r.resolvedAt!.getTime() <= r.dueAt!.getTime())
  return suppressSmallCell(judged.length, judged.length ? withinWindow.length / judged.length : 0)
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The trailing 6 calendar months including the current one, each bucketed by the
 *  grievance's filing month (not its resolution month) — the question a chart like
 *  this answers is "how is a cohort filed in month N doing", not "how much closure
 *  work happened in month N". */
export function computeTrend(rows: RawGrievance[], now: Date = new Date()): MonthPoint[] {
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))))
  }

  return months.map((month) => {
    const filed = rows.filter((r) => monthKey(r.createdAt) === month)
    const resolved = filed.filter((r) => r.resolvedAt !== null)
    const judged = resolved.filter((r) => r.dueAt !== null)
    const withinWindow = judged.filter((r) => r.resolvedAt!.getTime() <= r.dueAt!.getTime())
    const days = resolved.map((r) => daysBetween(r.createdAt, r.resolvedAt!)).sort((a, b) => a - b)

    return {
      month,
      filedCount: suppressSmallCell(filed.length, filed.length),
      medianResolutionDays: suppressSmallCell(days.length, days.length ? median(days) : 0),
      withinWindowRate: suppressSmallCell(judged.length, judged.length ? withinWindow.length / judged.length : 0),
    }
  })
}

// ---------------------------------------------------------------------------
// Impure entry point
// ---------------------------------------------------------------------------

/** `kind = 'grievance'` only — the transparency page is about grievance-redressal
 *  performance specifically, not suggestions or the appeal layer riding on top of it. */
export async function getTransparencyStats(institutionId: string): Promise<TransparencyStats> {
  const [rows, cats] = await withTenant(institutionId, async (tx) => {
    const rowsResult = await tx
      .select({
        categoryId: grievances.categoryId,
        createdAt: grievances.createdAt,
        resolvedAt: grievances.resolvedAt,
        dueAt: grievances.dueAt,
      })
      .from(grievances)
      .where(and(eq(grievances.institutionId, institutionId), eq(grievances.kind, 'grievance')))

    const catsResult = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.institutionId, institutionId), eq(categories.isActive, true)))

    return [rowsResult, catsResult] as const
  })

  return {
    totalFiled: rows.length,
    overallWithinWindowRate: computeOverallWithinWindowRate(rows),
    categories: computeCategoryStats(rows, cats),
    trend: computeTrend(rows),
  }
}
