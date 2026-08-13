import type { ReactNode } from 'react'
import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

const styles: Record<AlertVariant, { classes: string; icon: typeof Info }> = {
  info: { classes: 'bg-status-info-bg text-status-info-fg border-status-info-border', icon: Info },
  success: {
    classes: 'bg-status-success-bg text-status-success-fg border-status-success-border',
    icon: CheckCircle2,
  },
  warning: {
    classes: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border',
    icon: AlertTriangle,
  },
  danger: {
    classes: 'bg-status-danger-bg text-status-danger-fg border-status-danger-border',
    icon: XCircle,
  },
}

interface AlertProps {
  variant?: AlertVariant
  title: string
  children?: ReactNode
  className?: string
}

export function Alert({ variant = 'info', title, children, className }: AlertProps) {
  const { classes, icon: Icon } = styles[variant]
  return (
    <div role="alert" className={cn('flex gap-3 rounded-md border p-3 text-sm', classes, className)}>
      <Icon aria-hidden className="size-5 shrink-0" />
      <div>
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
    </div>
  )
}
