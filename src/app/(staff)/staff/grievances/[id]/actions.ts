'use server'

import { revalidatePath } from 'next/cache'
import type { Status } from '@/lib/grievance/policy'
import { addRemark, assignGrievance, transitionStatus } from '@/lib/grievance/service'
import { redirect } from 'next/navigation'
import { isCsrfValid } from '@/lib/auth/csrf'
import { requireStaffActor } from '../../../_lib/actor'

/**
 * grievanceId and `to` arrive via Function.bind at the call site (see page.tsx), not
 * as hidden form fields — same authorisation outcome either way (canSetStatus is still
 * the real gate), but a bound arg can't be edited in devtools before submit the way a
 * hidden input can, so what the button says is what gets sent.
 *
 * Deliberately silent on denial: the action panel only ever renders a button
 * allowedTransitions()/canAssign already permit, so a denial here means either a stale
 * page (revalidate covers that) or a forged request — neither gets special error UI.
 */
export async function transitionAction(grievanceId: string, to: Status, formData: FormData) {
  if (!(await isCsrfValid(formData))) redirect(`/staff/grievances/${grievanceId}?error=csrf`)
  const actor = await requireStaffActor()
  const remark = String(formData.get('remark') ?? '').trim()

  await transitionStatus(actor, grievanceId, to, remark || undefined)
  revalidatePath(`/staff/grievances/${grievanceId}`)
  revalidatePath('/staff')
}

export async function assignAction(grievanceId: string, formData: FormData) {
  if (!(await isCsrfValid(formData))) redirect(`/staff/grievances/${grievanceId}?error=csrf`)
  const actor = await requireStaffActor()
  const assigneeId = String(formData.get('assigneeId') ?? '')
  if (!assigneeId) return

  await assignGrievance(actor, grievanceId, assigneeId)
  revalidatePath(`/staff/grievances/${grievanceId}`)
  revalidatePath('/staff')
}

export async function addRemarkAction(grievanceId: string, formData: FormData) {
  if (!(await isCsrfValid(formData))) redirect(`/staff/grievances/${grievanceId}?error=csrf`)
  const actor = await requireStaffActor()
  const remark = String(formData.get('remark') ?? '').trim()
  const visibility = formData.get('visibility') === 'internal' ? 'internal' : 'public'
  if (!remark) return

  await addRemark(actor, grievanceId, remark, visibility)
  revalidatePath(`/staff/grievances/${grievanceId}`)
}
