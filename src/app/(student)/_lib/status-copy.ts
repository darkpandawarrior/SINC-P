/**
 * "Where is it and what happens next" in the student's own words — the whole reason
 * this vertical exists. The 2019 portal showed a raw status string ('in process') and
 * nothing else, which is a black hole with a label on it.
 */
import type { GrievanceEvent, User } from '@/db/schema'
import type { Status } from '@/lib/grievance/policy'

export const NEXT_STEP_COPY: Record<Status, string> = {
  submitted: 'Waiting for a moderator to review it.',
  under_review: 'Being screened before it is assigned to an officer.',
  in_progress: 'An officer is working on it.',
  resolved: 'A resolution has been proposed. Accept it or appeal below.',
  closed: 'Closed. You accepted this resolution.',
  rejected: 'Rejected. You may appeal this decision within the appeal window.',
  withdrawn: 'Withdrawn. You took this grievance back.',
  appealed: 'Under review by the Ombudsperson.',
}

export const EVENT_TYPE_LABEL: Record<GrievanceEvent['type'], string> = {
  submitted: 'Submitted',
  assigned: 'Assigned',
  status_changed: 'Status changed',
  remark_added: 'Remark',
  attachment_added: 'Attachment added',
  escalated: 'Escalated',
  appealed: 'Appeal filed',
  reopened: 'Reopened',
  sla_breached: 'SLA breached',
  withdrawn: 'Withdrawn',
}

export const ROLE_LABEL: Record<User['role'], string> = {
  student: 'Student',
  moderator: 'Moderator',
  redressal_officer: 'Redressal Officer',
  ombudsperson: 'Ombudsperson',
  institution_admin: 'Institution Admin',
}

export function humanizeStatus(status: Status): string {
  return status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** Who did this, from the reader's own point of view — "You" beats a role label when
 *  it's true, and a role label beats a name the student was never meant to see. */
export function eventActorLabel(event: Pick<GrievanceEvent, 'actorId' | 'actorRole'>, viewerId: string): string {
  if (event.actorId === viewerId) return 'You'
  if (event.actorRole) return ROLE_LABEL[event.actorRole]
  return 'System'
}

export function eventDescription(event: Pick<GrievanceEvent, 'type' | 'payload'>): string {
  if (event.type === 'status_changed') {
    const to = (event.payload as { to?: string } | null)?.to
    return to ? `Status changed to ${humanizeStatus(to as Status)}` : EVENT_TYPE_LABEL.status_changed
  }
  return EVENT_TYPE_LABEL[event.type]
}

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
