'use server'

import { ZodError } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { isCsrfValid } from '@/lib/auth/csrf'
import {
  createHandbookEntry,
  markReviewed,
  recordHelpfulVote,
  updateHandbookEntry,
  type HandbookEntryInput,
} from '@/lib/handbook/service'
import { getPublicInstitution } from '@/lib/stats'
import { requireStaffActor } from '../_lib/actor'

function readEntryInput(formData: FormData): HandbookEntryInput {
  const categoryId = String(formData.get('categoryId') ?? '')
  const owningOffice = String(formData.get('owningOffice') ?? '')
  return {
    question: String(formData.get('question') ?? ''),
    answer: String(formData.get('answer') ?? ''),
    categoryId: categoryId || null,
    owningOffice: owningOffice || null,
    isPublished: formData.get('isPublished') === 'on',
  }
}

export async function createHandbookEntryAction(formData: FormData): Promise<void> {
  const actor = await requireStaffActor('/handbook/new')
  if (!(await isCsrfValid(formData))) redirect('/handbook/new?error=csrf')

  let slug: string
  try {
    const entry = await createHandbookEntry(actor, readEntryInput(formData))
    slug = entry.slug
  } catch (err) {
    if (err instanceof ZodError) redirect('/handbook/new?error=invalid')
    throw err
  }

  revalidatePath('/handbook')
  redirect(`/handbook/${slug}`)
}

/** `currentSlug` is the entry's slug *before* this edit, bound from the edit page (which
 *  already loaded the entry) — needed so a validation failure can redirect back to the
 *  same edit page without a second database lookup to find it. */
export async function updateHandbookEntryAction(
  id: string,
  currentSlug: string,
  formData: FormData,
): Promise<void> {
  const actor = await requireStaffActor('/handbook')
  if (!(await isCsrfValid(formData))) redirect(`/handbook/${currentSlug}/edit?error=csrf`)

  let slug: string
  try {
    const entry = await updateHandbookEntry(actor, id, readEntryInput(formData))
    if (!entry) redirect('/handbook')
    slug = entry.slug
  } catch (err) {
    if (err instanceof ZodError) redirect(`/handbook/${currentSlug}/edit?error=invalid`)
    throw err
  }

  revalidatePath('/handbook')
  revalidatePath(`/handbook/${slug}`)
  redirect(`/handbook/${slug}`)
}

export async function markReviewedAction(id: string, _formData: FormData): Promise<void> {
  const actor = await requireStaffActor('/handbook')
  await markReviewed(actor, id)
  revalidatePath('/handbook')
}

/** No auth required — anyone reading a published answer can say whether it helped. */
export async function voteHelpfulAction(id: string, helpful: boolean, _formData: FormData): Promise<void> {
  const institution = await getPublicInstitution()
  if (!institution) return
  const entry = await recordHelpfulVote(institution.id, id, helpful)
  if (entry) revalidatePath(`/handbook/${entry.slug}`)
}
