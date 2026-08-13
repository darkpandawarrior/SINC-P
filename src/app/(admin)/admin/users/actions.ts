'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { inviteUser, setUserActive, setUserRole } from '@/lib/admin/service'
import { isCsrfValid } from '@/lib/auth/csrf'
import type { Role } from '@/lib/grievance/policy'
import { requireAdminActor } from '../../_lib/actor'

export interface InviteUserState {
  status: 'idle' | 'error' | 'email-taken' | 'invited'
  message?: string
  invited?: { email: string; fullName: string; temporaryPassword: string }
}

const initialState: InviteUserState = { status: 'idle' }
export { initialState as inviteUserInitialState }

/**
 * useActionState, not the redirect-then-revalidate shape the rest of this vertical
 * uses — the temporary password (admin/service.ts's own documented ponytail: no email
 * delivery yet) must never travel through a URL query string, so this renders the
 * result on the same submission instead of redirecting to a page that would have to
 * carry it there some other way.
 */
export async function inviteUserAction(_prev: InviteUserState, formData: FormData): Promise<InviteUserState> {
  const actor = await requireAdminActor('/admin/users')

  if (!(await isCsrfValid(formData))) {
    return { status: 'error', message: 'Your session expired. Please try again.' }
  }

  const email = String(formData.get('email') ?? '')
  const fullName = String(formData.get('fullName') ?? '')
  const role = String(formData.get('role') ?? '') as Role
  const rollNumber = String(formData.get('rollNumber') ?? '')
  const department = String(formData.get('department') ?? '')

  try {
    const result = await inviteUser(actor, {
      email,
      fullName,
      role,
      rollNumber: rollNumber || undefined,
      department: department || undefined,
    })
    if (!result.ok) return { status: 'email-taken', message: 'A user with that email already exists.' }

    revalidatePath('/admin/users')
    return {
      status: 'invited',
      invited: { email: result.user.email, fullName: result.user.fullName, temporaryPassword: result.temporaryPassword },
    }
  } catch (err) {
    if (err instanceof ZodError) return { status: 'error', message: 'Please check the fields and try again.' }
    throw err
  }
}

export async function setUserRoleAction(userId: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor('/admin/users')
  if (!(await isCsrfValid(formData))) return
  const role = String(formData.get('role') ?? '') as Role
  await setUserRole(actor, userId, role)
  revalidatePath('/admin/users')
}

export async function setUserActiveAction(userId: string, isActive: boolean, formData: FormData): Promise<void> {
  const actor = await requireAdminActor('/admin/users')
  if (!(await isCsrfValid(formData))) return
  await setUserActive(actor, userId, isActive)
  revalidatePath('/admin/users')
}
