'use client'

import { useActionState, useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { submitGrievanceAction, type FilingState } from './actions'

const initial: FilingState = {}

export function GrievanceForm({
  categoryId,
  categoryName,
  allowAnonymous,
  maxAttachments,
  maxSizeLabel,
  csrf,
}: {
  categoryId: string
  categoryName: string
  allowAnonymous: boolean
  maxAttachments: number
  maxSizeLabel: string
  csrf: ReactNode
}) {
  const [state, formAction, pending] = useActionState(submitGrievanceAction, initial)
  const errorRef = useRef<HTMLDivElement>(null)
  const v = state.values

  // The summary takes focus so a screen reader announces it once, instead of relying on
  // a role="alert" that re-fires on every re-render.
  useEffect(() => {
    if (state.error) errorRef.current?.focus()
  }, [state])

  return (
    <Card>
      <CardBody>
        <p className="mb-4 text-sm text-fg-muted">
          Filing under <span className="font-medium text-fg">{categoryName}</span>.{' '}
          <Link href="/my/new" className="text-accent hover:underline">
            Change category
          </Link>
        </p>

        {state.error && (
          <div ref={errorRef} tabIndex={-1} className="mb-4 outline-none">
            <Alert variant="danger" title={state.error}>
              {state.values && 'Your text is kept below. Reattach any files before sending again.'}
            </Alert>
          </div>
        )}

        <form action={formAction} className="flex flex-col gap-4" aria-busy={pending}>
          {csrf}
          <input type="hidden" name="categoryId" value={categoryId} />

          <Field
            id="subject"
            name="subject"
            label="Subject"
            required
            maxLength={200}
            placeholder="Short summary of the issue"
            defaultValue={v?.subject}
            readOnly={pending}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="body" className="text-sm font-medium text-fg">
              Details
              <span className="ml-1 text-status-danger-fg" aria-hidden>
                *
              </span>
            </label>
            <textarea
              id="body"
              name="body"
              required
              minLength={10}
              maxLength={8000}
              rows={6}
              placeholder="What happened, when, and who else was involved."
              defaultValue={v?.body}
              readOnly={pending}
              className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium text-fg">Type</legend>
            <label className="flex items-center gap-2 text-sm text-fg pointer-coarse:min-h-11">
              <input type="radio" name="kind" value="grievance" defaultChecked={v?.kind !== 'suggestion'} /> Grievance — something went wrong
            </label>
            <label className="flex items-center gap-2 text-sm text-fg pointer-coarse:min-h-11">
              <input type="radio" name="kind" value="suggestion" defaultChecked={v?.kind === 'suggestion'} /> Suggestion — an idea for improvement
            </label>
          </fieldset>

          {allowAnonymous && (
            <label className="flex items-start gap-2 text-sm text-fg pointer-coarse:min-h-11">
              <input type="checkbox" name="isAnonymous" className="mt-0.5" defaultChecked={v?.isAnonymous} />
              <span>
                File anonymously. Your name is withheld from the committee&apos;s screen and review, but is retained
                internally — this is not anonymous to the institution, only to the people handling your case.
              </span>
            </label>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="attachments" className="text-sm font-medium text-fg">
              Attachments (optional)
            </label>
            <input
              id="attachments"
              type="file"
              name="attachments"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
              className="text-sm text-fg"
              aria-describedby="attachments-hint"
            />
            <p id="attachments-hint" className="text-xs text-fg-muted">
              Up to {maxAttachments} files, {maxSizeLabel} each. PDF, image, or plain text.
            </p>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? 'Filing…' : 'File grievance'}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
