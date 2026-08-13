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
  under_review: ['moderator', 'redressal_officer', 'institution_admin', 'icc_member'],
  in_progress: ['redressal_officer', 'ombudsperson', 'institution_admin', 'icc_member'],
  resolved: ['redressal_officer', 'ombudsperson', 'institution_admin', 'icc_member'],
  rejected: ['moderator', 'redressal_officer', 'institution_admin', 'icc_member'],
  // Only the student who filed it may close (accept the resolution) or withdraw.
  closed: ['student'],
  withdrawn: ['student'],
  appealed: ['student'],
}

const STAFF_ROLES: readonly Role[] = [
  'moderator',
  'redressal_officer',
  'ombudsperson',
  'icc_member',
  'institution_admin',
]

export type Track = Grievance['track']

/**
 * Who may see a track at all, before any per-record question is asked.
 *
 * `icc` is the reason this exists. A sexual harassment complaint under the PoSH Act 2013
 * and the UGC 2015 Regulations is confidential to the Internal Complaints Committee. A
 * moderator triaging the general queue must never see one, and neither must the Registrar
 * simply for being the Registrar: `institution_admin` is a system administration role,
 * not a member of that committee.
 *
 * This is deliberately a hard gate rather than a filter. Filters get forgotten on the
 * next screen someone adds.
 */
const TRACK_ROLES: Record<Track, readonly Role[]> = {
  sgrc: ['moderator', 'redressal_officer', 'ombudsperson', 'institution_admin'],
  // No moderator. No institution_admin. Committee only.
  icc: ['icc_member'],
  anti_ragging: ['moderator', 'redressal_officer', 'ombudsperson', 'institution_admin'],
}

/** True when this actor's role is permitted to see this statutory track at all. */
export function canAccessTrack(role: Role, track: Track): boolean {
  if (role === 'student') return true // ownership is checked separately
  return TRACK_ROLES[track].includes(role)
}

export const ALL_TRACKS = Object.keys(TRACK_ROLES) as Track[]

/**
 * The tracks a role may see, for building a SQL WHERE clause.
 *
 * `canView` protects a record once you hold it. A list query never holds one: it builds
 * a WHERE clause and returns whatever matches, so without this the officer queue would
 * hand a moderator every ICC complaint in the institution. Per-record checks do not
 * protect list endpoints, and that is the bug this function exists to prevent.
 */
export function accessibleTracks(role: Role): Track[] {
  return ALL_TRACKS.filter((t) => canAccessTrack(role, t))
}

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

  // Track before record. A staff member who cannot see this regime cannot see this
  // grievance, whatever their role would otherwise allow.
  if (!canAccessTrack(actor.role, grievance.track)) return false

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
    case 'icc_member':
      // The gate above already restricted this to the icc track.
      return true
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
