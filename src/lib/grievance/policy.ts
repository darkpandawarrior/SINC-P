/**
 * Authorisation and the grievance state machine, in one file on purpose.
 *
 * Who may do a thing and what things are possible are the same question, and splitting
 * them is how you end up with a UI that offers a button the server then rejects — or
 * worse, accepts.
 *
 * The 2019 code had no authorisation layer at all. `complaint-details.php?cid=5` read
 * the id straight from the query string and rendered whatever came back, so any logged-
 * in student could read every other student's complaints by counting upwards. That is
 * the single bug this module exists to make structurally impossible.
 */
import type { Grievance, User } from '@/db/schema'

export type Role = User['role']
export type Status = Grievance['status']

/**
 * Legal transitions. Anything not listed here cannot happen, including the ones that
 * look harmless — a closed grievance must not slide back to in_progress without going
 * through `reopened`, or the SLA clock becomes unauditable.
 */
const TRANSITIONS: Record<Status, readonly Status[]> = {
  submitted: ['under_review', 'rejected', 'withdrawn'],
  under_review: ['in_progress', 'rejected', 'withdrawn'],
  in_progress: ['resolved', 'withdrawn'],
  resolved: ['closed', 'appealed'], // student either accepts or appeals
  closed: ['appealed'], // appeal window stays open per institution config
  appealed: ['in_progress', 'resolved'], // Ombudsperson picks it back up
  rejected: ['appealed'],
  withdrawn: [], // terminal: the student took it back
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to)
}

export function allowedTransitions(from: Status): readonly Status[] {
  return TRANSITIONS[from]
}

/** Which roles may drive a grievance into a given status. */
const TRANSITION_ROLES: Partial<Record<Status, readonly Role[]>> = {
  under_review: ['moderator', 'redressal_officer', 'institution_admin'],
  in_progress: ['redressal_officer', 'ombudsperson', 'institution_admin'],
  resolved: ['redressal_officer', 'ombudsperson', 'institution_admin'],
  rejected: ['moderator', 'redressal_officer', 'institution_admin'],
  // Only the student who filed it may close (accept the resolution) or withdraw.
  closed: ['student'],
  withdrawn: ['student'],
  appealed: ['student'],
}

const STAFF_ROLES: readonly Role[] = [
  'moderator',
  'redressal_officer',
  'ombudsperson',
  'institution_admin',
]

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role)
}

export interface Actor {
  id: string
  role: Role
  institutionId: string
}

/**
 * The single read-authorisation check. Every path that returns a grievance must call
 * this — there is no second way to be allowed to see one.
 */
export function canView(actor: Actor, grievance: Grievance): boolean {
  // Cross-tenant is not a permission question; it is impossible. RLS enforces it too,
  // but failing here means a bug surfaces as a 403 in tests rather than an empty list.
  if (actor.institutionId !== grievance.institutionId) return false

  if (actor.role === 'student') return grievance.submittedById === actor.id

  // A moderator screens the queue, so sees everything. An officer sees what is assigned
  // to them plus anything unassigned they could pick up. The Ombudsperson sees appeals.
  switch (actor.role) {
    case 'moderator':
    case 'institution_admin':
      return true
    case 'redressal_officer':
      return grievance.assignedToId === actor.id || grievance.assignedToId === null
    case 'ombudsperson':
      return (
        grievance.status === 'appealed' ||
        grievance.appealOfId !== null ||
        grievance.assignedToId === actor.id
      )
    default:
      return false
  }
}

export function canComment(actor: Actor, grievance: Grievance): boolean {
  if (!canView(actor, grievance)) return false
  // A withdrawn grievance is closed to further discussion by anyone.
  return grievance.status !== 'withdrawn'
}

/** Internal remarks — screening notes, routing rationale — are staff-only. */
export function canViewInternalRemarks(actor: Actor, grievance: Grievance): boolean {
  return canView(actor, grievance) && isStaff(actor.role)
}

export type TransitionDenial =
  | { ok: true }
  | { ok: false; reason: 'not-visible' | 'illegal-transition' | 'wrong-role' | 'not-owner' }

/**
 * The authoritative check. Returns a reason rather than a boolean so the caller can log
 * *why* — a spike of 'wrong-role' denials is someone probing, and that belongs in
 * auth_events.
 */
export function canSetStatus(actor: Actor, grievance: Grievance, to: Status): TransitionDenial {
  if (!canView(actor, grievance)) return { ok: false, reason: 'not-visible' }
  if (!canTransition(grievance.status, to)) return { ok: false, reason: 'illegal-transition' }

  const permitted = TRANSITION_ROLES[to]
  if (!permitted || !permitted.includes(actor.role)) return { ok: false, reason: 'wrong-role' }

  // Student-driven transitions are only ever valid on the student's own grievance.
  // canView already implies this for students, but stating it defends against a future
  // change to canView silently widening these.
  if (actor.role === 'student' && grievance.submittedById !== actor.id) {
    return { ok: false, reason: 'not-owner' }
  }

  return { ok: true }
}

export function canAssign(actor: Actor, grievance: Grievance): boolean {
  return (
    canView(actor, grievance) &&
    (actor.role === 'moderator' || actor.role === 'institution_admin')
  )
}

/** Statuses that stop the SLA clock. Used by both the due-date maths and the dashboard. */
export const TERMINAL_STATUSES: readonly Status[] = ['closed', 'rejected', 'withdrawn']

export function isOpen(status: Status): boolean {
  return !TERMINAL_STATUSES.includes(status)
}
