import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary:
    'bg-surface text-fg border border-border-strong hover:bg-status-neutral-bg',
  danger: 'bg-status-danger-fg text-white hover:opacity-90',
  ghost: 'text-fg hover:bg-status-neutral-bg',
}

/** Exported so a styled link (Next `<Link>`) can look like a button without a second
 *  component — asChild polymorphism is overkill for one call site. */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  return cn(base, sizes[size], variants[variant])
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return <button className={cn(buttonClasses(variant, size), className)} {...props} />
}
