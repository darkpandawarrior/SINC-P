'use client'

import { useActionState } from 'react'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { login, type LoginState } from './actions'

/**
 * The only client component in the auth flow, and only for the pending state and the
 * error region. Without JS this is still a plain POST form that works — colleges have
 * bad connectivity and a login that needs a hydrated bundle is a login that fails.
 */
export function LoginForm({
  csrfToken,
  csrfField,
  returnTo,
}: {
  csrfToken: string
  csrfField: string
  returnTo?: string
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name={csrfField} value={csrfToken} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      {state.error && (
        // aria-live so a screen reader announces the failure; without it the only
        // feedback is a visual change the user cannot perceive.
        <div aria-live="polite">
          <Alert variant="danger" title="Could not sign in">
            {state.error}
          </Alert>
        </div>
      )}

      <Field
        id="email"
        name="email"
        type="email"
        label="Email address"
        autoComplete="username"
        required
        autoFocus
      />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
      />

      <Button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
