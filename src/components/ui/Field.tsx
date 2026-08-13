import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  /** Explicit id, not useId() — this is a Server Component and the caller already
   *  knows the field's name, so a generated id buys nothing but a hook dependency. */
  id: string
  label: string
  error?: string
  hint?: string
}

export function Field({ id, label, error, hint, required, className, ...props }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="ml-1 text-status-danger-fg" aria-hidden>
            *
          </span>
        )}
      </label>
      <input
        id={id}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={cn(
          'rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg',
          'placeholder:text-fg-muted',
          error && 'border-status-danger-border',
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-status-danger-fg">
          {error}
        </p>
      )}
    </div>
  )
}
