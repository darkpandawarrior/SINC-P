/**
 * Display state for the SLA badge.
 *
 * This deliberately does NOT implement its own threshold. An earlier version did — a
 * fixed 48 hours — while the queue filter used the real engine's
 * `max(20% of window, 3 days)`. The same row could then appear under the "Due soon"
 * filter while its own badge rendered a green "On track", and on a 30-day ombudsperson
 * window the two disagreed for a full four days. Staff filtering for at-risk cases saw
 * the rows contradict the filter that selected them.
 *
 * So the open-case decision comes from `@/lib/grievance/sla` and nowhere else. What
 * lives here is only the extra presentation distinction the engine has no opinion on:
 * once a case is finished, was the deadline met or missed.
 *
 * Kept out of the .tsx so it can be unit tested without a JSX transform — this repo's
 * vitest runs in the `node` environment.
 */
import type { Grievance } from '@/db/schema'
import { slaState as engineSlaState } from '@/lib/grievance/sla'
import { isOpen } from '@/lib/grievance/policy'

export type SlaState = 'no_sla' | 'on_track' | 'due_soon' | 'overdue' | 'met' | 'breached'

export type SlaSubject = Pick<Grievance, 'status' | 'dueAt' | 'createdAt' | 'resolvedAt'>

export function computeSlaState(grievance: SlaSubject, now: Date = new Date()): SlaState {
  if (!grievance.dueAt) return 'no_sla'

  if (!isOpen(grievance.status)) {
    // ponytail: a terminal grievance with no resolvedAt (rejected/withdrawn) has
    // nothing to judge a breach against, so it reads as 'met' rather than 'breached'.
    // Revisit if a customer wants rejected-but-late tracked separately.
    if (!grievance.resolvedAt) return 'met'
    return grievance.resolvedAt.getTime() <= grievance.dueAt.getTime() ? 'met' : 'breached'
  }

  // One source of truth for every open case.
  switch (engineSlaState(grievance, now)) {
    case 'breached':
      // The engine calls a live, past-due case 'breached'; the badge says "Overdue",
      // reserving "SLA breached" for a finished case that missed its deadline.
      return 'overdue'
    case 'stopped':
      return 'met'
    case 'due_soon':
      return 'due_soon'
    default:
      return 'on_track'
  }
}
