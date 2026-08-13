import type { Role } from '@/lib/grievance/policy'

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  moderator: 'Moderator',
  redressal_officer: 'Redressal Officer',
  ombudsperson: 'Ombudsperson',
  icc_member: 'ICC Member',
  institution_admin: 'Institution Admin',
}
