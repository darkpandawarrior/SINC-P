import { describe, expect, it } from 'vitest'
import {
  computeCategoryStats,
  computeOverallWithinWindowRate,
  computeTrend,
  MIN_CELL_SIZE,
  suppressSmallCell,
  type RawGrievance,
} from './stats'

function daysAgo(n: number, from = new Date('2026-03-15T00:00:00Z')): Date {
  return new Date(from.getTime() - n * 86_400_000)
}

describe('suppressSmallCell', () => {
  it('suppresses below MIN_CELL_SIZE and passes through at or above it', () => {
    expect(suppressSmallCell(0, 'x')).toBeNull()
    expect(suppressSmallCell(MIN_CELL_SIZE - 1, 'x')).toBeNull()
    expect(suppressSmallCell(MIN_CELL_SIZE, 'x')).toBe('x')
    expect(suppressSmallCell(MIN_CELL_SIZE + 1, 'x')).toBe('x')
  })
})

describe('computeCategoryStats', () => {
  const cats = [{ id: 'hostel', name: 'Hostel' }]

  it('suppresses filedCount for a category with fewer than 5 grievances', () => {
    const rows: RawGrievance[] = Array.from({ length: 4 }, () => ({
      categoryId: 'hostel',
      createdAt: daysAgo(10),
      resolvedAt: null,
      dueAt: null,
    }))
    const [stat] = computeCategoryStats(rows, cats)
    expect(stat!.filedCount).toBeNull()
    expect(stat!.medianResolutionDays).toBeNull()
  })

  it('suppresses the median independently of a visible filed count', () => {
    // 6 filed (visible), only 3 resolved (median stays suppressed).
    const rows: RawGrievance[] = [
      ...Array.from({ length: 3 }, () => ({
        categoryId: 'hostel',
        createdAt: daysAgo(10),
        resolvedAt: daysAgo(5),
        dueAt: daysAgo(0),
      })),
      ...Array.from({ length: 3 }, () => ({
        categoryId: 'hostel',
        createdAt: daysAgo(2),
        resolvedAt: null,
        dueAt: null,
      })),
    ]
    const [stat] = computeCategoryStats(rows, cats)
    expect(stat!.filedCount).toBe(6)
    expect(stat!.medianResolutionDays).toBeNull()
  })

  it('computes the median resolution days once the resolved subset clears the floor', () => {
    // resolution times of 1,2,3,4,5 days -> median 3
    const rows: RawGrievance[] = [1, 2, 3, 4, 5].map((d) => ({
      categoryId: 'hostel',
      createdAt: daysAgo(d),
      resolvedAt: daysAgo(0),
      dueAt: daysAgo(-1),
    }))
    const [stat] = computeCategoryStats(rows, cats)
    expect(stat!.filedCount).toBe(5)
    expect(stat!.medianResolutionDays).toBe(3)
  })

  it('averages the two middle values for an even-sized resolved set', () => {
    const rows: RawGrievance[] = [1, 2, 3, 4, 5, 6].map((d) => ({
      categoryId: 'hostel',
      createdAt: daysAgo(d),
      resolvedAt: daysAgo(0),
      dueAt: daysAgo(-1),
    }))
    const [stat] = computeCategoryStats(rows, cats)
    // resolved ages: 1,2,3,4,5,6 -> median (3+4)/2 = 3.5
    expect(stat!.medianResolutionDays).toBe(3.5)
  })

  it('a row belonging to a different category never contaminates this one', () => {
    const rows: RawGrievance[] = [
      ...Array.from({ length: 5 }, () => ({
        categoryId: 'hostel',
        createdAt: daysAgo(1),
        resolvedAt: daysAgo(0),
        dueAt: daysAgo(-1),
      })),
      ...Array.from({ length: 5 }, () => ({
        categoryId: 'other',
        createdAt: daysAgo(1),
        resolvedAt: daysAgo(0),
        dueAt: daysAgo(-1),
      })),
    ]
    const [stat] = computeCategoryStats(rows, cats)
    expect(stat!.filedCount).toBe(5)
  })
})

describe('computeOverallWithinWindowRate', () => {
  it('suppresses below the floor', () => {
    const rows: RawGrievance[] = Array.from({ length: 4 }, () => ({
      categoryId: null,
      createdAt: daysAgo(10),
      resolvedAt: daysAgo(1),
      dueAt: daysAgo(2),
    }))
    expect(computeOverallWithinWindowRate(rows)).toBeNull()
  })

  it('ignores grievances that are still open (no resolvedAt)', () => {
    const rows: RawGrievance[] = [
      ...Array.from({ length: 5 }, () => ({
        categoryId: null,
        createdAt: daysAgo(10),
        resolvedAt: daysAgo(1), // resolved before due -> within window
        dueAt: daysAgo(0),
      })),
      ...Array.from({ length: 20 }, () => ({
        categoryId: null,
        createdAt: daysAgo(1),
        resolvedAt: null, // still open, must not dilute the denominator
        dueAt: daysAgo(-10),
      })),
    ]
    expect(computeOverallWithinWindowRate(rows)).toBe(1)
  })

  it('computes the correct fraction once resolved', () => {
    const onTime = Array.from({ length: 3 }, () => ({
      categoryId: null,
      createdAt: daysAgo(10),
      resolvedAt: daysAgo(1),
      dueAt: daysAgo(0), // resolved before due
    }))
    const late = Array.from({ length: 2 }, () => ({
      categoryId: null,
      createdAt: daysAgo(10),
      resolvedAt: daysAgo(0),
      dueAt: daysAgo(1), // resolved after due
    }))
    expect(computeOverallWithinWindowRate([...onTime, ...late])).toBe(3 / 5)
  })
})

describe('computeTrend', () => {
  const now = new Date('2026-03-15T00:00:00Z')

  it('returns exactly 6 trailing months ending on the current month', () => {
    const trend = computeTrend([], now)
    expect(trend.map((p) => p.month)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'])
  })

  it('buckets a grievance by its filing month, and suppresses a thin month', () => {
    const rows: RawGrievance[] = Array.from({ length: 3 }, () => ({
      categoryId: null,
      createdAt: new Date('2026-02-10T00:00:00Z'),
      resolvedAt: null,
      dueAt: null,
    }))
    const trend = computeTrend(rows, now)
    const feb = trend.find((p) => p.month === '2026-02')!
    expect(feb.filedCount).toBeNull() // only 3, below the floor
  })

  it('shows a real count once a month clears the floor', () => {
    const rows: RawGrievance[] = Array.from({ length: 7 }, () => ({
      categoryId: null,
      createdAt: new Date('2026-02-10T00:00:00Z'),
      resolvedAt: null,
      dueAt: null,
    }))
    const trend = computeTrend(rows, now)
    const feb = trend.find((p) => p.month === '2026-02')!
    expect(feb.filedCount).toBe(7)
  })
})
