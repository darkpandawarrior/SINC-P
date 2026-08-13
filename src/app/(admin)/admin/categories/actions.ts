'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { createCategory, setCategoryActive, updateCategory, type CategoryInput } from '@/lib/admin/service'
import { isCsrfValid } from '@/lib/auth/csrf'
import { requireAdminActor } from '../../_lib/actor'

function readCategoryInput(formData: FormData): CategoryInput {
  const parentId = String(formData.get('parentId') ?? '')
  const slaResolutionDays = String(formData.get('slaResolutionDays') ?? '')
  const description = String(formData.get('description') ?? '')
  return {
    name: String(formData.get('name') ?? ''),
    description: description || undefined,
    parentId: parentId || null,
    slaResolutionDays: slaResolutionDays ? Number(slaResolutionDays) : null,
    isSensitive: formData.get('isSensitive') === 'on',
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
  }
}

export async function createCategoryAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor('/admin/categories/new')
  if (!(await isCsrfValid(formData))) redirect('/admin/categories/new?error=csrf')

  try {
    await createCategory(actor, readCategoryInput(formData))
  } catch (err) {
    if (err instanceof ZodError) redirect('/admin/categories/new?error=invalid')
    throw err
  }

  revalidatePath('/admin/categories')
  redirect('/admin/categories')
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor('/admin/categories')
  if (!(await isCsrfValid(formData))) redirect(`/admin/categories/${id}/edit?error=csrf`)

  try {
    const row = await updateCategory(actor, id, readCategoryInput(formData))
    if (!row) redirect('/admin/categories')
  } catch (err) {
    if (err instanceof ZodError) redirect(`/admin/categories/${id}/edit?error=invalid`)
    if (err instanceof Error && /own parent/.test(err.message)) redirect(`/admin/categories/${id}/edit?error=cycle`)
    throw err
  }

  revalidatePath('/admin/categories')
  redirect('/admin/categories')
}

export async function setCategoryActiveAction(id: string, isActive: boolean, formData: FormData): Promise<void> {
  const actor = await requireAdminActor('/admin/categories')
  if (!(await isCsrfValid(formData))) return
  await setCategoryActive(actor, id, isActive)
  revalidatePath('/admin/categories')
}
