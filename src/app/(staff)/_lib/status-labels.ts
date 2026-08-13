import type { Status } from '@/lib/grievance/policy'

/** One place for the queue filter and the case-view action panel to agree on what a
 *  status is called — StatusPill has its own copy for the badge icon/colour, this is
 *  just the plain-text form a <select> or a button label needs. */
export const STATUS_LABELS: Record<Status, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  appealed: 'Appealed',
}
