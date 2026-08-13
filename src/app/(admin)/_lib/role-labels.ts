import type { Role } from '@/lib/grievance/policy'

/** Own copy rather than importing (staff)/_lib/role-labels.ts — each vertical owns its
 *  own display labels (see (staff)/_lib/role-labels.ts and _/status-labels.ts for the
 *  same pattern); five entries drifting apart costs nothing, a cross-route-group import
 *  of another vertical's presentation module would. */
export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  moderator: 'Moderator',
  redressal_officer: 'Redressal Officer',
  ombudsperson: 'Ombudsperson',
  icc_member: 'ICC Member',
  institution_admin: 'Institution Admin',
}
