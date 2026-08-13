import { describe, expect, it } from 'vitest'
import type { Category, Grievance } from '@/db/schema'
import { ageingBuckets, appealRate, buildComplianceStats, categoryStats, complianceCsv, wasBreached } from './compliance'

const NOW = new Date('2026-06-01T00:00:00Z')

const grievance = (over: Partial<Grievance> = {}): Grievance =>
  ({
    id: 'g-1',
    institutionId: 'inst-1',
    reference: 'MANIT-2026-00001',
    submittedById: 'student-1',
    isAnonymous: false,
    categoryId: 'cat-1',
    kind: 'grievance',
    subject: 's',
    body: 'b',
    status: 'submitted',
    assignedToId: null,
    dueAt: new Date('2026-05-15T00:00:00Z'),
    resolvedAt: null,
    closedAt: null,
    appealOfId: null,
    satisfactionRating: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...over,
  }) as Grievance

describe('wasBreached', () => {
  it('is false when there is no due date', () => {
    expect(wasBreached(grievance({ dueAt: null }), NOW)).toBe(false)
  })

  it('is true when resolved after the due date', () => {
    const g = grievance({ status: 'closed', resolvedAt: new Date('2026-05-20T00:00:00Z') })
    expect(wasBreached(g, NOW)).toBe(true)
  })

  it('is false when resolved before the due date', () => {
    const g = grievance({ status: 'closed', resolvedAt: new Date('2026-05-10T00:00:00Z') })
    expect(wasBreached(g, NOW)).toBe(false)
  })

  it('is true when still open and past due', () => {
    const g = grievance({ status: 'in_progress', dueAt: new Date('2026-05-20T00:00:00Z') })
    expect(wasBreached(g, NOW)).toBe(true)
  })

  it('is false for withdrawn or rejected even if past due, since there was no resolution to be late', () => {
    expect(wasBreached(grievance({ status: 'withdrawn' }), NOW)).toBe(false)
    expect(wasBreached(grievance({ status: 'rejected' }), NOW)).toBe(false)
  })
})

describe('ageingBuckets', () => {
  it('only counts open grievances, bucketed by age from now', () => {
    const items = [
      grievance({ status: 'submitted', createdAt: new Date('2026-05-30T00:00:00Z') }), // 2 days
      grievance({ status: 'in_progress', createdAt: new Date('2026-05-20T00:00:00Z') }), // 12 days
      grievance({ status: 'in_progress', createdAt: new Date('2026-05-01T00:00:00Z') }), // 31 days
      grievance({ status: 'closed', createdAt: new Date('2026-01-01T00:00:00Z') }), // excluded: terminal
    ]
    const buckets = ageingBuckets(items, NOW)
    expect(buckets.find((b) => b.label === '0–7 days')?.count).toBe(1)
    expect(buckets.find((b) => b.label === '8–15 days')?.count).toBe(1)
    expect(buckets.find((b) => b.label === '30+ days')?.count).toBe(1)
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(3)
  })
})

describe('appealRate', () => {
  it('divides appeal filings by decided originals, excluding appeals from the denominator', () => {
    const items = [
      grievance({ kind: 'grievance', status: 'closed' }),
      grievance({ kind: 'grievance', status: 'appealed' }),
      grievance({ kind: 'appeal', status: 'submitted' }),
      grievance({ kind: 'grievance', status: 'in_progress' }), // not yet decided, excluded
    ]
    expect(appealRate(items)).toBe(0.5) // 1 appeal / 2 decided originals
  })

  it('is 0 when nothing has been decided yet', () => {
    expect(appealRate([grievance({ kind: 'grievance', status: 'submitted' })])).toBe(0)
  })
})

describe('categoryStats', () => {
  const categories: Pick<Category, 'id' | 'name'>[] = [{ id: 'cat-1', name: 'Hostel' }]

  it('computes median resolution days and groups an unset category as Uncategorised', () => {
    const items = [
      grievance({
        categoryId: 'cat-1',
        status: 'closed',
        createdAt: new Date('2026-05-01T00:00:00Z'),
        resolvedAt: new Date('2026-05-06T00:00:00Z'), // 5 days
      }),
      grievance({
        categoryId: 'cat-1',
        status: 'closed',
        createdAt: new Date('2026-05-01T00:00:00Z'),
        resolvedAt: new Date('2026-05-11T00:00:00Z'), // 10 days
      }),
      grievance({ categoryId: null, status: 'submitted' }),
    ]
    const stats = categoryStats(items, categories, NOW)
    const hostel = stats.find((s) => s.categoryId === 'cat-1')
    expect(hostel?.medianResolutionDays).toBe(7.5)
    expect(hostel?.count).toBe(2)
    const uncategorised = stats.find((s) => s.categoryId === null)
    expect(uncategorised?.categoryName).toBe('Uncategorised')
  })
})

describe('complianceCsv', () => {
  it('quotes fields containing a comma and produces one flat table', () => {
    const stats = buildComplianceStats(
      [grievance({ status: 'closed', resolvedAt: new Date('2026-05-06T00:00:00Z') })],
      [{ id: 'cat-1', name: 'Hostel, Mess' }],
      new Date('2026-01-01T00:00:00Z'),
      NOW,
      NOW,
    )
    const csv = complianceCsv(stats)
    expect(csv).toContain('"Hostel, Mess"')
    expect(csv).toContain('Total filed,1')
  })
})
