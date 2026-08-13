'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { updateInstitutionSettings } from '@/lib/admin/service'
import { isCsrfValid } from '@/lib/auth/csrf'
import { requireAdminActor } from '../../_lib/actor'

export async function updateInstitutionSettingsAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor('/admin/settings')
  if (!(await isCsrfValid(formData))) redirect('/admin/settings?error=csrf')

  try {
    await updateInstitutionSettings(actor, {
      slaResolutionDays: Number(formData.get('slaResolutionDays') ?? 0),
      slaAppealWindowDays: Number(formData.get('slaAppealWindowDays') ?? 0),
      slaOmbudspersonDays: Number(formData.get('slaOmbudspersonDays') ?? 0),
      allowAnonymous: formData.get('allowAnonymous') === 'on',
    })
  } catch (err) {
    if (err instanceof ZodError) redirect('/admin/settings?error=invalid')
    throw err
  }

  revalidatePath('/admin/settings')
  redirect('/admin/settings?saved=1')
}
