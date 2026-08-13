import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeVariant =
  | 'neutral'
  | 'neutralMuted'
  | 'info'
  | 'success'
  | 'successStrong'
  | 'danger'
  | 'escalate'
  | 'warning'
  | 'accent'

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border',
  neutralMuted:
    'bg-status-neutral-muted-bg text-status-neutral-muted-fg border-status-neutral-muted-border',
  info: 'bg-status-info-bg text-status-info-fg border-status-info-border',
  success: 'bg-status-success-bg text-status-success-fg border-status-success-border',
  successStrong:
    'bg-status-success-strong-bg text-status-success-strong-fg border-status-success-strong-border',
  danger: 'bg-status-danger-bg text-status-danger-fg border-status-danger-border',
  escalate: 'bg-status-escalate-bg text-status-escalate-fg border-status-escalate-border',
  warning: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border',
  accent: 'bg-accent-soft-bg text-accent-soft-fg border-accent-soft-border',
}

interface BadgeProps {
  variant?: BadgeVariant
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * The shared visual primitive behind StatusPill and SlaBadge. Bg-tint + dark-fg text
 * on a border, never a saturated bg with white text — small chips at 4.5:1 fail AA
 * fast with the latter, and this repo is a statutory tool where that's not optional.
 */
export function Badge({ variant = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
