'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Status } from '@/lib/grievance/policy'
import { bulkAssign, bulkTransition, type BulkResult } from '@/lib/grievance/service'
import { isCsrfValid } from '@/lib/auth/csrf'
import { requireStaffActor } from '../_lib/actor'

/** Folds a bulk op's per-row result into the redirect target's query string so the
 *  queue page can show "3 assigned, 1 skipped" without any client state — the whole
 *  bulk-triage flow, selection through feedback, is plain HTML forms and a redirect. */
function withBulkResult(returnTo: string, result: BulkResult): string {
  const [path, query = ''] = returnTo.split('?')
  const params = new URLSearchParams(query)
  params.set('bulkOk', String(result.succeeded.length))
  params.set('bulkFailed', String(result.failed.length))
  return `${path}?${params.toString()}`
}

function formIds(formData: FormData): string[] {
  return formData.getAll('grievanceIds').map(String)
}

function formReturnTo(formData: FormData): string {
  const raw = String(formData.get('returnTo') ?? '/staff')
  // Same-origin, relative only — a returnTo is a hidden field a compromised client
  // could edit, and redirect() must never be handed an attacker-controlled absolute URL.
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/staff'
}

export async function bulkAssignAction(formData: FormData) {
  const actor = await requireStaffActor()
  if (!(await isCsrfValid(formData))) redirect('/staff?error=csrf')
  const ids = formIds(formData)
  const assigneeId = String(formData.get('assigneeId') ?? '')
  const returnTo = formReturnTo(formData)

  const result = ids.length > 0 && assigneeId ? await bulkAssign(actor, ids, assigneeId) : { succeeded: [], failed: [] }

  revalidatePath('/staff')
  redirect(withBulkResult(returnTo, result))
}

export async function bulkTransitionAction(formData: FormData) {
  const actor = await requireStaffActor()
  if (!(await isCsrfValid(formData))) redirect('/staff?error=csrf')
  const ids = formIds(formData)
  const to = String(formData.get('status') ?? '') as Status
  const returnTo = formReturnTo(formData)

  const result = ids.length > 0 && to ? await bulkTransition(actor, ids, to) : { succeeded: [], failed: [] }

  revalidatePath('/staff')
  redirect(withBulkResult(returnTo, result))
}
