'use server'

/**
 * The three things a student can do to a grievance from its own page. Every one of
 * these is a thin wrapper: the actual legality of the transition is decided once, in
 * policy.ts's canSetStatus, via the service functions below. Nothing here re-checks it.
 *
 * Every redirect() call happens outside a try/catch, on purpose: it throws a control-flow
 * exception, and a catch sitting around it would swallow that and misreport the outcome.
 */
import { redirect } from 'next/navigation'
import { isCsrfValid } from '@/lib/auth/csrf'
import { closeGrievance, fileAppeal, withdrawGrievance } from '@/lib/grievance/service'
import { requireStudentActor } from '../../_lib/actor'

function fields(formData: FormData) {
  return {
    grievanceId: String(formData.get('grievanceId') ?? ''),
    reference: String(formData.get('reference') ?? ''),
  }
}

function backToDetail(reference: string, error?: string): never {
  const qs = error ? `?${new URLSearchParams({ error })}` : ''
  redirect(`/my/${reference}${qs}`)
}

export async function withdrawAction(formData: FormData): Promise<void> {
  const { actor } = await requireStudentActor()
  const { grievanceId, reference } = fields(formData)
  if (!(await isCsrfValid(formData))) backToDetail(reference, 'Your session expired. Please try again.')

  const remark = String(formData.get('remark') ?? '').trim()
  const result = await withdrawGrievance(actor, grievanceId, remark || undefined)
  backToDetail(reference, result.ok ? undefined : 'This grievance can no longer be withdrawn.')
}

export async function closeAction(formData: FormData): Promise<void> {
  const { actor } = await requireStudentActor()
  const { grievanceId, reference } = fields(formData)
  if (!(await isCsrfValid(formData))) backToDetail(reference, 'Your session expired. Please try again.')

  const ratingRaw = String(formData.get('satisfactionRating') ?? '')
  const satisfactionRating = ratingRaw ? Number(ratingRaw) : undefined
  const remark = String(formData.get('remark') ?? '').trim()

  let error: string | undefined
  try {
    const result = await closeGrievance(actor, grievanceId, { satisfactionRating, remark: remark || undefined })
    if (!result.ok) error = 'This grievance can no longer be accepted.'
  } catch {
    error = 'Could not record your rating. Please try again.'
  }
  backToDetail(reference, error)
}

export async function appealAction(formData: FormData): Promise<void> {
  const { actor } = await requireStudentActor()
  const { grievanceId, reference } = fields(formData)
  if (!(await isCsrfValid(formData))) backToDetail(reference, 'Your session expired. Please try again.')

  const body = String(formData.get('body') ?? '')
  let appealReference: string | undefined
  let error: string | undefined
  try {
    const result = await fileAppeal(actor, grievanceId, { body })
    if (result.ok) appealReference = result.appeal.reference
    else error = 'This grievance is outside its appeal window or cannot be appealed.'
  } catch {
    error = 'Please write at least 10 characters explaining your appeal.'
  }

  if (appealReference) redirect(`/my/${appealReference}?filed=1`)
  backToDetail(reference, error)
}
