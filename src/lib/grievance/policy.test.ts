import { describe, expect, it } from 'vitest'
import {
  allowedTransitions,
  canAssign,
  canSetStatus,
  canTransition,
  canView,
  accessibleTracks,
  canViewInternalRemarks,
  isOpen,
  isStaff,
  type Actor,
  type Status,
} from './policy'
import type { Grievance } from '@/db/schema'

const INST_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const INST_B = 'bbbbbbbb-0000-0000-0000-000000000002'
const STUDENT = 'student-1'
const OTHER_STUDENT = 'student-2'
const OFFICER = 'officer-1'

const actor = (role: Actor['role'], id = 'x', institutionId = INST_A): Actor => ({
  id,
  role,
  institutionId,
})

const grievance = (over: Partial<Grievance> = {}): Grievance =>
  ({
    id: 'g-1',
    institutionId: INST_A,
    reference: 'MANIT-2026-00001',
    submittedById: STUDENT,
    isAnonymous: false,
    categoryId: 'c-1',
    kind: 'grievance',
    track: 'sgrc',
    subject: 's',
    body: 'b',
    status: 'submitted',
    assignedToId: null,
    dueAt: null,
    resolvedAt: null,
    closedAt: null,
    appealOfId: null,
    satisfactionRating: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as Grievance

describe('canView', () => {
  it('never crosses an institution boundary, whatever the role', () => {
    const g = grievance({ institutionId: INST_A })
    for (const role of ['student', 'moderator', 'institution_admin', 'ombudsperson'] as const) {
      expect(canView(actor(role, 'anyone', INST_B), g)).toBe(false)
    }
  })

  it('lets a student see only their own', () => {
    const g = grievance({ submittedById: STUDENT })
    expect(canView(actor('student', STUDENT), g)).toBe(true)
    // This is exactly the 2019 IDOR: complaint-details.php?cid=N rendered whatever
    // came back, so counting upwards read the whole college's complaints.
    expect(canView(actor('student', OTHER_STUDENT), g)).toBe(false)
  })

  it('gives an officer their assigned cases plus the unassigned pool', () => {
    expect(canView(actor('redressal_officer', OFFICER), grievance({ assignedToId: OFFICER }))).toBe(
      true,
    )
    expect(canView(actor('redressal_officer', OFFICER), grievance({ assignedToId: null }))).toBe(
      true,
    )
    expect(
      canView(actor('redressal_officer', OFFICER), grievance({ assignedToId: 'someone-else' })),
    ).toBe(false)
  })

  it('gives the ombudsperson appeals, not the general queue', () => {
    const omb = actor('ombudsperson', 'omb-1')
    expect(canView(omb, grievance({ status: 'appealed' }))).toBe(true)
    expect(canView(omb, grievance({ appealOfId: 'g-0' }))).toBe(true)
    expect(canView(omb, grievance({ status: 'submitted' }))).toBe(false)
  })
})

describe('state machine', () => {
  it('has no transition out of a withdrawn grievance', () => {
    expect(allowedTransitions('withdrawn')).toHaveLength(0)
  })

  it('refuses to slide a closed grievance back into progress', () => {
    // Going closed -> in_progress without an explicit appeal would make the SLA clock
    // unauditable, which is the one thing this product sells.
    expect(canTransition('closed', 'in_progress')).toBe(false)
    expect(canTransition('closed', 'appealed')).toBe(true)
  })

  it('never lists a status as its own successor', () => {
    const all: Status[] = [
      'submitted',
      'under_review',
      'in_progress',
      'resolved',
      'closed',
      'rejected',
      'withdrawn',
      'appealed',
    ]
    for (const s of all) expect(allowedTransitions(s)).not.toContain(s)
  })
})

describe('canSetStatus', () => {
  it('lets a moderator start review but not resolve', () => {
    const g = grievance({ status: 'submitted' })
    const mod = actor('moderator', 'mod-1')
    expect(canSetStatus(mod, g, 'under_review')).toEqual({ ok: true })
    // 'resolved' is not reachable from 'submitted' at all, so the machine rejects it
    // before the role is even considered.
    expect(canSetStatus(mod, g, 'resolved')).toEqual({
      ok: false,
      reason: 'illegal-transition',
    })
  })

  it('stops an officer from closing on the student behalf', () => {
    // Only the student accepts a resolution. An officer closing their own case is how
    // resolution statistics get fabricated.
    const g = grievance({ status: 'resolved', assignedToId: OFFICER })
    expect(canSetStatus(actor('redressal_officer', OFFICER), g, 'closed')).toEqual({
      ok: false,
      reason: 'wrong-role',
    })
  })

  it('lets the filing student close and withdraw', () => {
    expect(canSetStatus(actor('student', STUDENT), grievance({ status: 'resolved' }), 'closed'))
      .toEqual({ ok: true })
    expect(canSetStatus(actor('student', STUDENT), grievance({ status: 'submitted' }), 'withdrawn'))
      .toEqual({ ok: true })
  })

  it('denies a student acting on another student grievance', () => {
    const g = grievance({ status: 'resolved', submittedById: STUDENT })
    expect(canSetStatus(actor('student', OTHER_STUDENT), g, 'closed')).toEqual({
      ok: false,
      reason: 'not-visible',
    })
  })

  it('denies everything across a tenant boundary', () => {
    const g = grievance({ status: 'submitted', institutionId: INST_A })
    expect(canSetStatus(actor('institution_admin', 'a', INST_B), g, 'under_review')).toEqual({
      ok: false,
      reason: 'not-visible',
    })
  })
})

describe('remark visibility and assignment', () => {
  it('hides internal remarks from the student who filed it', () => {
    const g = grievance({ submittedById: STUDENT })
    expect(canViewInternalRemarks(actor('student', STUDENT), g)).toBe(false)
    expect(canViewInternalRemarks(actor('moderator', 'mod-1'), g)).toBe(true)
  })

  it('restricts assignment to moderators and admins', () => {
    const g = grievance()
    expect(canAssign(actor('moderator', 'mod-1'), g)).toBe(true)
    expect(canAssign(actor('institution_admin', 'adm-1'), g)).toBe(true)
    expect(canAssign(actor('redressal_officer', OFFICER), g)).toBe(false)
    expect(canAssign(actor('student', STUDENT), g)).toBe(false)
  })
})

describe('helpers', () => {
  it('classifies staff roles', () => {
    expect(isStaff('student')).toBe(false)
    for (const r of ['moderator', 'redressal_officer', 'ombudsperson', 'institution_admin'] as const)
      expect(isStaff(r)).toBe(true)
  })

  it('stops the SLA clock only on terminal statuses', () => {
    expect(isOpen('in_progress')).toBe(true)
    expect(isOpen('resolved')).toBe(true) // resolved still awaits student acceptance
    expect(isOpen('closed')).toBe(false)
    expect(isOpen('withdrawn')).toBe(false)
    expect(isOpen('rejected')).toBe(false)
  })
})

describe('statutory tracks and ICC confidentiality', () => {
  const icc = (over: Partial<Grievance> = {}) => grievance({ track: 'icc', ...over })

  it('hides an ICC case from the moderator who triages everything else', () => {
    // The moderator is otherwise unrestricted, which is exactly why this needs a test.
    // Under the PoSH Act the complaint is confidential to the committee, and a triage
    // queue is the one place it must never appear.
    expect(canView(actor('moderator', 'mod-1'), icc())).toBe(false)
    expect(canView(actor('moderator', 'mod-1'), grievance())).toBe(true)
  })

  it('hides an ICC case from the institution admin', () => {
    // Being the Registrar is a system administration role, not membership of the
    // Internal Complaints Committee.
    expect(canView(actor('institution_admin', 'adm-1'), icc())).toBe(false)
  })

  it('hides an ICC case from a redressal officer, even when assigned', () => {
    expect(canView(actor('redressal_officer', OFFICER), icc({ assignedToId: OFFICER }))).toBe(false)
  })

  it('hides an ICC case from the Ombudsperson', () => {
    expect(canView(actor('ombudsperson', 'omb-1'), icc({ status: 'appealed' }))).toBe(false)
  })

  it('shows an ICC case to a committee member', () => {
    expect(canView(actor('icc_member', 'icc-1'), icc())).toBe(true)
  })

  it('does not let a committee member into the general queue', () => {
    // The gate runs both ways. ICC membership is not a wildcard.
    expect(canView(actor('icc_member', 'icc-1'), grievance())).toBe(false)
    expect(canView(actor('icc_member', 'icc-1'), grievance({ track: 'anti_ragging' }))).toBe(false)
  })

  it('still lets the student who filed it see their own ICC case', () => {
    expect(canView(actor('student', STUDENT), icc({ submittedById: STUDENT }))).toBe(true)
    expect(canView(actor('student', OTHER_STUDENT), icc({ submittedById: STUDENT }))).toBe(false)
  })

  it('blocks a non-member from acting on an ICC case', () => {
    expect(canSetStatus(actor('moderator', 'mod-1'), icc(), 'under_review')).toEqual({
      ok: false,
      reason: 'not-visible',
    })
  })

  it('lets a committee member act on an ICC case', () => {
    expect(canSetStatus(actor('icc_member', 'icc-1'), icc(), 'under_review')).toEqual({ ok: true })
  })

  it('reports the tracks each role may query, for the list WHERE clause', () => {
    // canView protects a record once you hold it. A list query never holds one, so this
    // is what stops the officer queue handing a moderator every ICC complaint.
    expect(accessibleTracks('moderator')).toEqual(['sgrc', 'anti_ragging'])
    expect(accessibleTracks('institution_admin')).toEqual(['sgrc', 'anti_ragging'])
    expect(accessibleTracks('icc_member')).toEqual(['icc'])
    expect(accessibleTracks('redressal_officer')).not.toContain('icc')
    expect(accessibleTracks('ombudsperson')).not.toContain('icc')
  })

  it('never returns an empty track list for a staff role', () => {
    // An empty list compiles to `false` in the WHERE clause, which would silently show a
    // role nothing at all rather than failing loudly.
    for (const r of ['moderator', 'redressal_officer', 'ombudsperson', 'icc_member', 'institution_admin'] as const) {
      expect(accessibleTracks(r).length).toBeGreaterThan(0)
    }
  })
})
