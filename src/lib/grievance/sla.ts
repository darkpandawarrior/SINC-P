/**
 * The statutory SLA clock. This is the module a UGC auditor's question — "prove every
 * grievance was answered inside the window" — actually gets answered by.
 *
 * Institutions are all in Asia/Kolkata, which has never observed DST and sits at a
 * fixed UTC+5:30 offset year-round, so a timezone library buys nothing a hardcoded
 * offset doesn't. The bug it guards against: IST midnight is 5:30 *ahead* of UTC
 * midnight, so a grievance filed at 11pm IST is still "today" in UTC for another 90
 * minutes. Compute a due date off UTC calendar days and it silently lands a day early
 * or late depending on what time of day someone filed — wrong in a way nobody notices
 * until an audit lines up the dates. Every day-boundary computation below goes through
 * `istWallClock` so it walks IST calendar days, never UTC ones.
 */
import type { Grievance, Institution } from '@/db/schema'
import type { Role } from './policy'
import { TERMINAL_STATUSES } from './policy'

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000
const DAY_MS = 86_400_000

/** A Date whose UTC getters read as IST wall-clock fields. This is not a real instant
 *  by itself — it exists only so `getUTCFullYear/Month/Date/Day` can be read as "the
 *  IST calendar date", using getters that don't depend on the host machine's timezone. */
function istWallClock(instant: Date): Date {
  return new Date(instant.getTime() + IST_OFFSET_MS)
}

/** The real UTC instant of 23:59:59.999 IST on the given IST calendar date. "Due by
 *  day N" means the whole Nth day is available, not just its first millisecond. */
function istEndOfDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - IST_OFFSET_MS)
}

/** Integer day number of an instant's IST calendar date — same value for every instant
 *  that falls on the same IST day, regardless of time of day. Used for "N days" badges,
 *  which should tick over at IST midnight, not 24 rolling hours from submission. */
function istDayNumber(instant: Date): number {
  const w = istWallClock(instant)
  return Math.floor(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) / DAY_MS)
}

export type SlaMode = 'calendar' | 'working'

export interface SlaWindow {
  institutionSlaDays: number
  /** Category override wins when present. `null`/`undefined` both mean "no override". */
  categorySlaDays?: number | null
  mode?: SlaMode
  /** Only consulted in working-day mode. Each entry's IST calendar date is what's
   *  compared — the time-of-day and offset it was constructed with don't matter. Take
   *  these from the institution's own config; this module invents no holiday calendar. */
  holidays?: Date[]
}

/** Statutory windows are calendar days by default; institutions that opt into
 *  working-day counting skip Sunday plus their configured holiday list. */
export function computeDueAt(submittedAt: Date, window: SlaWindow): Date {
  const days = window.categorySlaDays ?? window.institutionSlaDays
  const mode = window.mode ?? 'calendar'
  const wall = istWallClock(submittedAt)
  let y = wall.getUTCFullYear()
  let m = wall.getUTCMonth()
  let d = wall.getUTCDate()

  if (mode === 'calendar') {
    // Date.UTC normalises overflow (day 32 rolls into next month), so plain addition
    // on the IST-derived y/m/d is correct calendar-day arithmetic.
    const due = new Date(Date.UTC(y, m, d + days))
    return istEndOfDay(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  }

  const holidayKeys = new Set((window.holidays ?? []).map((h) => istDayNumber(h)))
  let remaining = days
  while (remaining > 0) {
    const next = new Date(Date.UTC(y, m, d + 1))
    y = next.getUTCFullYear()
    m = next.getUTCMonth()
    d = next.getUTCDate()
    const isSunday = next.getUTCDay() === 0
    const isHoliday = holidayKeys.has(Math.floor(next.getTime() / DAY_MS))
    if (isSunday || isHoliday) continue
    remaining -= 1
  }
  return istEndOfDay(y, m, d)
}

/** Whole IST calendar days between now and the due date. Negative once overdue.
 *  Deliberately a calendar-day count, not a rolling 24h count, so the dashboard badge
 *  changes at IST midnight the way a Registrar reading it expects. */
export function daysRemaining(dueAt: Date, now: Date): number {
  return istDayNumber(dueAt) - istDayNumber(now)
}

export function daysOverdue(dueAt: Date, now: Date): number {
  return Math.max(0, istDayNumber(now) - istDayNumber(dueAt))
}

export type SlaState = 'on_track' | 'due_soon' | 'breached' | 'stopped'

type SlaGrievance = Pick<Grievance, 'status' | 'dueAt' | 'createdAt'>

/**
 * `due_soon` fires inside 20% of the window remaining, or 3 days, whichever is larger —
 * so a 60-day appeal window still warns with more than a token few hours left, while a
 * short category override doesn't warn on day one. This math is duration-based (a
 * difference between two instants), so it needs no IST handling at all — only the
 * calendar-day placement of the due date itself does.
 */
export function slaState(grievance: SlaGrievance, now: Date): SlaState {
  if (TERMINAL_STATUSES.includes(grievance.status)) return 'stopped'
  // No due date computed yet (pre-submit edge case) — nothing to be on track against.
  if (!grievance.dueAt) return 'on_track'

  const dueAt = grievance.dueAt.getTime()
  const nowMs = now.getTime()
  if (nowMs >= dueAt) return 'breached'

  const totalWindowMs = dueAt - grievance.createdAt.getTime()
  const remainingMs = dueAt - nowMs
  const dueSoonThresholdMs = Math.max(totalWindowMs * 0.2, 3 * DAY_MS)
  return remainingMs <= dueSoonThresholdMs ? 'due_soon' : 'on_track'
}

export interface EscalationTarget {
  role: Role
  /** A specific person when we know one (the assigned officer); otherwise anyone
   *  holding this role at the institution. */
  userId: string | null
}

/**
 * The UGC escalation ladder: officer -> institution_admin -> ombudsperson, in order.
 * Returns the whole ladder — deciding how far up it to actually page on a given breach
 * is a notification-policy question, not this function's job.
 *
 * ponytail: `institution` is accepted for a future per-institution escalation contact
 * list but unused today — nothing in the schema varies the ladder per institution yet.
 * Upgrade when an institution wants to name a specific admin/ombudsperson contact.
 */
export function escalationTargets(
  grievance: Pick<Grievance, 'assignedToId'>,
  _institution: Pick<Institution, 'id'>,
): EscalationTarget[] {
  const targets: EscalationTarget[] = []
  if (grievance.assignedToId) {
    targets.push({ role: 'redressal_officer', userId: grievance.assignedToId })
  }
  targets.push({ role: 'institution_admin', userId: null })
  targets.push({ role: 'ombudsperson', userId: null })
  return targets
}
