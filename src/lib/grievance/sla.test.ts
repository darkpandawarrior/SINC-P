import { describe, expect, it } from 'vitest'
import { computeDueAt, daysOverdue, daysRemaining, escalationTargets, slaState } from './sla'

describe('computeDueAt — calendar mode', () => {
  it('adds calendar days on the IST clock, not the UTC one', () => {
    const submittedAt = new Date('2026-01-01T10:00:00+05:30')
    const dueAt = computeDueAt(submittedAt, { institutionSlaDays: 15 })
    // 15 days after 1 Jan IST is 16 Jan IST, end of day, in UTC that's 18:29:59.999.
    expect(dueAt.toISOString()).toBe('2026-01-16T18:29:59.999Z')
  })

  it('buckets a submission at IST midnight into the correct IST day', () => {
    // 2026-01-01T00:00:00+05:30 is 2025-12-31T18:30:00Z — a naive UTC-calendar-day
    // implementation would count this as 31 Dec and land the due date a day early.
    const submittedAt = new Date('2026-01-01T00:00:00+05:30')
    const dueAt = computeDueAt(submittedAt, { institutionSlaDays: 1 })
    expect(dueAt.toISOString()).toBe('2026-01-02T18:29:59.999Z')
  })

  it('category override wins over the institution default', () => {
    const submittedAt = new Date('2026-01-01T10:00:00+05:30')
    const dueAt = computeDueAt(submittedAt, { institutionSlaDays: 15, categorySlaDays: 5 })
    expect(dueAt.toISOString()).toBe('2026-01-06T18:29:59.999Z')
  })

  it('treats a categorySlaDays of null the same as no override', () => {
    const submittedAt = new Date('2026-01-01T10:00:00+05:30')
    const dueAt = computeDueAt(submittedAt, { institutionSlaDays: 15, categorySlaDays: null })
    expect(dueAt.toISOString()).toBe('2026-01-16T18:29:59.999Z')
  })
})

describe('computeDueAt — working-day mode', () => {
  it('skips Sunday', () => {
    // 1 Jan 2026 is a Thursday. 3 working days out is Fri, Sat, (skip Sun), Mon.
    const submittedAt = new Date('2026-01-01T10:00:00+05:30')
    const dueAt = computeDueAt(submittedAt, {
      institutionSlaDays: 3,
      mode: 'working',
    })
    expect(dueAt.toISOString()).toBe('2026-01-05T18:29:59.999Z') // Monday
  })

  it('also skips a supplied holiday', () => {
    const submittedAt = new Date('2026-01-01T10:00:00+05:30')
    const dueAt = computeDueAt(submittedAt, {
      institutionSlaDays: 3,
      mode: 'working',
      holidays: [new Date('2026-01-05')], // the Monday that would otherwise be day 3
    })
    expect(dueAt.toISOString()).toBe('2026-01-06T18:29:59.999Z') // pushed to Tuesday
  })
})

describe('slaState', () => {
  const createdAt = new Date('2026-01-01T00:00:00Z')
  const dueAt = new Date('2026-01-11T00:00:00Z') // 10-day window

  it('is stopped for every terminal status regardless of the clock', () => {
    for (const status of ['closed', 'rejected', 'withdrawn'] as const) {
      const state = slaState({ status, dueAt, createdAt }, new Date('2099-01-01T00:00:00Z'))
      expect(state).toBe('stopped')
    }
  })

  it('is on_track well before the due_soon threshold', () => {
    const now = new Date(dueAt.getTime() - 4 * 86_400_000) // 4 days left, threshold is 3
    expect(slaState({ status: 'in_progress', dueAt, createdAt }, now)).toBe('on_track')
  })

  it('is due_soon inside the larger of 20% of window or 3 days', () => {
    const now = new Date(dueAt.getTime() - 2 * 86_400_000) // 2 days left, threshold is 3
    expect(slaState({ status: 'in_progress', dueAt, createdAt }, now)).toBe('due_soon')
  })

  it('is breached exactly at the due instant', () => {
    expect(slaState({ status: 'in_progress', dueAt, createdAt }, dueAt)).toBe('breached')
  })

  it('stays breached across a weekend — the clock does not pause once running', () => {
    const fridayDueAt = new Date('2026-01-02T23:59:59.999+05:30') // Friday
    const mondayNow = new Date('2026-01-05T09:00:00+05:30') // following Monday
    const state = slaState(
      { status: 'in_progress', dueAt: fridayDueAt, createdAt: new Date('2026-01-01T00:00:00Z') },
      mondayNow,
    )
    expect(state).toBe('breached')
  })

  it('is on_track when no due date has been computed yet', () => {
    expect(slaState({ status: 'submitted', dueAt: null, createdAt }, new Date())).toBe('on_track')
  })
})

describe('daysRemaining / daysOverdue', () => {
  const dueAt = new Date('2026-01-10T12:00:00+05:30')

  it('counts whole IST calendar days remaining', () => {
    const now = new Date('2026-01-08T08:00:00+05:30')
    expect(daysRemaining(dueAt, now)).toBe(2)
  })

  it('is zero on the due date itself, any time of day', () => {
    const now = new Date('2026-01-10T23:00:00+05:30')
    expect(daysRemaining(dueAt, now)).toBe(0)
  })

  it('counts overdue days once past the due date', () => {
    const now = new Date('2026-01-12T00:30:00+05:30')
    expect(daysOverdue(dueAt, now)).toBe(2)
  })

  it('never goes negative while still on track', () => {
    const now = new Date('2026-01-08T08:00:00+05:30')
    expect(daysOverdue(dueAt, now)).toBe(0)
  })
})

describe('escalationTargets', () => {
  const institution = { id: 'inst-1' }

  it('omits the officer rung when nobody is assigned', () => {
    const targets = escalationTargets({ assignedToId: null }, institution)
    expect(targets).toEqual([
      { role: 'institution_admin', userId: null },
      { role: 'ombudsperson', userId: null },
    ])
  })

  it('leads with the assigned officer, then the rest of the ladder', () => {
    const targets = escalationTargets({ assignedToId: 'officer-1' }, institution)
    expect(targets).toEqual([
      { role: 'redressal_officer', userId: 'officer-1' },
      { role: 'institution_admin', userId: null },
      { role: 'ombudsperson', userId: null },
    ])
  })
})
