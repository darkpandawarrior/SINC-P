'use client'

import { useId, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, type ButtonVariant } from './Button'

/**
 * A submit button that asks first. Place it inside the <form> it submits.
 *
 * Uses the native modal <dialog> rather than a hand-built overlay: showModal() makes the
 * rest of the page inert (the focus trap), closes on Esc, and returns focus to the trigger
 * for free. window.confirm is unlabelled, unstyled, and suppressed by some mobile browsers.
 */
export function ConfirmSubmit({
  label,
  title,
  description,
  confirmLabel,
  variant = 'primary',
}: {
  label: string
  title: string
  description: ReactNode
  confirmLabel: string
  variant?: ButtonVariant
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  return (
    <>
      <Button type="button" size="sm" variant={variant} className="w-fit" onClick={() => ref.current?.showModal()}>
        {label}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="m-auto w-[min(92vw,26rem)] rounded-lg border border-border bg-surface p-5 text-fg shadow-overlay backdrop:bg-black/50"
      >
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm text-fg-muted">
          {description}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" size="sm" autoFocus onClick={() => ref.current?.close()}>
            Cancel
          </Button>
          <ConfirmButton variant={variant}>{confirmLabel}</ConfirmButton>
        </div>
      </dialog>
    </>
  )
}

function ConfirmButton({ variant, children }: { variant: ButtonVariant; children: ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? 'Working…' : children}
    </Button>
  )
}
