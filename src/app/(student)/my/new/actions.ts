'use server'

/**
 * Filing a grievance and attaching evidence, in that order: the grievance is the thing
 * that must exist even if a file upload afterwards goes wrong, never the other way
 * round. A failed attachment after a successful submit still leaves the student with a
 * real reference number — the detail page just tells them the attachment didn't make it.
 */
import { Readable } from 'node:stream'
import { ZodError } from 'zod'
import { redirect } from 'next/navigation'
import { isCsrfValid } from '@/lib/auth/csrf'
import { addAttachment, submitGrievance } from '@/lib/grievance/service'
import { storage, StorageError } from '@/lib/storage/local'
import { requireStudentActor } from '../../_lib/actor'

// A student attaching evidence to a hostel/mess/exam complaint rarely needs more than a
// couple of photos or a PDF; this caps a bulk-upload mistake, not a legitimate case.
export const MAX_ATTACHMENTS = 3

function friendlyError(err: unknown): string {
  if (err instanceof ZodError) return 'Please check the required fields and try again.'
  if (err instanceof Error) {
    if (err.message.includes('anonymous filing')) return 'This institution does not allow anonymous filing.'
    if (err.message.includes('unknown or inactive category')) return 'Please choose a valid category.'
  }
  return 'Something went wrong filing your grievance. Please try again.'
}

function backToForm(categoryId: string, error: string): never {
  const qs = new URLSearchParams({ category: categoryId, continue: '1', error })
  redirect(`/my/new?${qs}`)
}

export async function submitGrievanceAction(formData: FormData): Promise<void> {
  const { actor } = await requireStudentActor()

  const categoryId = String(formData.get('categoryId') ?? '')
  if (!(await isCsrfValid(formData))) {
    backToForm(categoryId, 'Your session expired. Please try again.')
  }

  const files = formData.getAll('attachments').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > MAX_ATTACHMENTS) {
    backToForm(categoryId, `Attach at most ${MAX_ATTACHMENTS} files.`)
  }

  const subject = String(formData.get('subject') ?? '')
  const body = String(formData.get('body') ?? '')
  const kind = formData.get('kind') === 'suggestion' ? 'suggestion' : 'grievance'
  const isAnonymous = formData.get('isAnonymous') === 'on'

  let reference: string
  let grievanceId: string
  try {
    const grievance = await submitGrievance(actor, { categoryId, subject, body, kind, isAnonymous })
    reference = grievance.reference
    grievanceId = grievance.id
  } catch (err) {
    backToForm(categoryId, friendlyError(err))
  }

  const attachmentErrors: string[] = []
  for (const file of files) {
    try {
      // Readable.fromWeb wants node:stream/web's ReadableStream type; File.stream() is
      // typed against DOM's — same shape at runtime, different declaration files. The
      // existing attachment route (route.ts) casts the same boundary the other direction.
      const webStream = file.stream() as unknown as Parameters<typeof Readable.fromWeb>[0]
      const put = await storage.put(Readable.fromWeb(webStream), { declaredContentType: file.type || undefined })
      await addAttachment(actor, grievanceId, {
        storageKey: put.storageKey,
        fileName: file.name,
        contentType: put.contentType,
        byteSize: put.byteSize,
        sha256: put.sha256,
      })
    } catch (err) {
      const reason = err instanceof StorageError ? err.message : 'upload failed'
      attachmentErrors.push(`${file.name}: ${reason}`)
    }
  }

  const qs = new URLSearchParams({ filed: '1' })
  if (attachmentErrors.length > 0) qs.set('attachmentError', attachmentErrors.join('; '))
  redirect(`/my/${reference}?${qs}`)
}
