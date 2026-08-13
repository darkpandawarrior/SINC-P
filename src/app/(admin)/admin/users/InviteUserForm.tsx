'use client'

import type { ReactNode } from 'react'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import type { Role } from '@/lib/grievance/policy'
import { inviteUserAction } from './actions'
import { inviteUserInitialState } from './state'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'student', label: 'Student' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'redressal_officer', label: 'Redressal Officer' },
  { value: 'ombudsperson', label: 'Ombudsperson' },
  { value: 'institution_admin', label: 'Institution Admin' },
]

/**
 * `csrfField` arrives pre-rendered from the server page as `<CsrfField />` (the same
 * async Server Component every other form in this vertical uses) rather than a token
 * string this component turns into an <input> itself. useActionState forces this into a
 * Client Component, and a Client Component importing anything from '@/lib/auth/csrf'
 * drags that module's import chain (csrf.ts -> session.ts -> db/client.ts -> `pg`) into
 * the browser bundle, where `pg`'s use of Node's `net`/`tls` fails to resolve. React
 * Server Components can be passed as children/props into a Client Component and still
 * render server-side, so slotting the whole element in sidesteps the bundling problem
 * entirely instead of re-deriving the field name as a duplicate string constant.
 */
export function InviteUserForm({ csrfField }: { csrfField: ReactNode }) {
  const [state, formAction, pending] = useActionState(inviteUserAction, inviteUserInitialState)

  if (state.status === 'invited' && state.invited) {
    return (
      <Alert variant="success" title={`Invited ${state.invited.fullName}`}>
        <p>
          Temporary password (shown once — relay it by hand, it is never stored in plaintext):{' '}
          <code className="rounded bg-status-neutral-bg px-1.5 py-0.5 font-mono text-sm">
            {state.invited.temporaryPassword}
          </code>
        </p>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {csrfField}
      {(state.status === 'error' || state.status === 'email-taken') && (
        <Alert variant="danger" title={state.message ?? 'Something went wrong.'} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="email" name="email" type="email" label="Email" required maxLength={255} />
        <Field id="fullName" name="fullName" label="Full name" required maxLength={200} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-sm font-medium text-fg">
            Role <span className="text-status-danger-fg">*</span>
          </label>
          <select
            id="role"
            name="role"
            required
            defaultValue=""
            className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
          >
            <option value="" disabled>
              Choose a role
            </option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <Field id="rollNumber" name="rollNumber" label="Roll / employee number" hint="Optional" maxLength={64} />
        <Field id="department" name="department" label="Department" hint="Optional" maxLength={200} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Inviting…' : 'Invite'}
        </Button>
      </div>
    </form>
  )
}
