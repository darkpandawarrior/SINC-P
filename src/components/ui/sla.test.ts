import { describe, expect, it } from 'vitest'
import { computeSlaState, type SlaSubject } from './sla'
import { slaState } from '@/lib/grievance/sla'
import type { Grievance } from '@/db/schema'

const NOW = new Date('2026-08-13T06:00:00Z')
const HOUR = 3_600_000
const DAY = 86_400_000

const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow)

const subject = (over: Partial<SlaSubject> = {}): SlaSubject => ({
  status: 'in_progress',
  createdAt: at(-5 * DAY),
  dueAt: at(5 * DAY),
  resolvedAt: null,
  ...over,
})

describe('SLA badge state', () => {
  it('reports no_sla when there is no due date', () => {
    expect(computeSlaState(subject({ dueAt: null }), NOW)).toBe('no_sla')
  })

  it('reports overdue for a live case past its deadline', () => {
    expect(computeSlaState(subject({ dueAt: at(-1 * HOUR) }), NOW)).toBe('overdue')
  })

  it('reports on_track with most of the window left', () => {
    const s = subject({ createdAt: at(-1 * DAY), dueAt: at(14 * DAY) })
    expect(computeSlaState(s, NOW)).toBe('on_track')
  })

  it('distinguishes met from breached once the case is finished', () => {
    const closedInTime = subject({
      status: 'closed',
      dueAt: at(-1 * DAY),
      resolvedAt: at(-2 * DAY),
    })
    const closedLate = subject({
      status: 'closed',
      dueAt: at(-2 * DAY),
      resolvedAt: at(-1 * DAY),
    })
    expect(computeSlaState(closedInTime, NOW)).toBe('met')
    expect(computeSlaState(closedLate, NOW)).toBe('breached')
  })

  it('treats a terminal case with no resolution as met, not breached', () => {
    // Withdrawn and rejected have no resolution to judge a deadline against.
    expect(computeSlaState(subject({ status: 'withdrawn', resolvedAt: null }), NOW)).toBe('met')
  })
})

describe('badge agrees with the queue filter', () => {
  /**
   * Regression test for a real drift bug.
   *
   * The badge used to carry its own fixed 48-hour "due soon" threshold while the queue
   * filter used the engine's max(20% of window, 3 days). On a 15-day SLA with 60 hours
   * left, the queue listed a case under "Due soon" and the badge on that very row
   * rendered a green "On track". On a 30-day ombudsperson window the two disagreed for
   * four straight days.
   *
   * These must not be allowed to drift again, so the assertion is not "the badge says
   * due_soon" — it is "the badge agrees with the engine", checked across the whole
   * window rather than at one convenient point.
   */
  const cases: Array<{ name: string; windowDays: number; hoursLeft: number }> = [
    { name: '15-day SLA, 60h left (the original disagreement)', windowDays: 15, hoursLeft: 60 },
    { name: '15-day SLA, 80h left', windowDays: 15, hoursLeft: 80 },
    { name: '15-day SLA, 20h left', windowDays: 15, hoursLeft: 20 },
    { name: '30-day appeal window, 100h left', windowDays: 30, hoursLeft: 100 },
    { name: '30-day appeal window, 5h left', windowDays: 30, hoursLeft: 5 },
    { name: '5-day sensitive SLA, 20h left', windowDays: 5, hoursLeft: 20 },
    { name: '5-day sensitive SLA, 100h left', windowDays: 5, hoursLeft: 100 },
  ]

  for (const { name, windowDays, hoursLeft } of cases) {
    it(name, () => {
      const dueAt = at(hoursLeft * HOUR)
      const createdAt = new Date(dueAt.getTime() - windowDays * DAY)
      const s = subject({ createdAt, dueAt })

      const engine = slaState(s as Grievance, NOW) // what the queue filter uses
      const badge = computeSlaState(s, NOW)

      // 'breached' is the engine's word for a live overdue case; the badge says
      // 'overdue'. Every other open-case value must match exactly.
      const expected = engine === 'breached' ? 'overdue' : engine
      expect(badge).toBe(expected)
    })
  }

  it('follows the engine across an entire window, hour by hour', () => {
    // The bug was invisible at most sample points and obvious in a sweep.
    const windowDays = 15
    for (let hoursLeft = 0; hoursLeft <= windowDays * 24; hoursLeft += 1) {
      const dueAt = at(hoursLeft * HOUR)
      const createdAt = new Date(dueAt.getTime() - windowDays * DAY)
      const s = subject({ createdAt, dueAt })

      const engine = slaState(s as Grievance, NOW)
      const expected = engine === 'breached' ? 'overdue' : engine
      expect(computeSlaState(s, NOW), `at ${hoursLeft}h remaining`).toBe(expected)
    }
  })
})
