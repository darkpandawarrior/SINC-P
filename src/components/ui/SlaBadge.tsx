import { CheckCircle2, Clock3, AlarmClock, AlertTriangle, MinusCircle } from 'lucide-react'
import { Badge, type BadgeVariant } from './Badge'
import { computeSlaState, type SlaState, type SlaSubject } from './sla'

const SLA_META: Record<SlaState, { variant: BadgeVariant; label: string; icon: typeof Clock3 }> = {
  no_sla: { variant: 'neutralMuted', label: 'No SLA', icon: MinusCircle },
  on_track: { variant: 'success', label: 'On track', icon: Clock3 },
  due_soon: { variant: 'warning', label: 'Due soon', icon: AlarmClock },
  overdue: { variant: 'danger', label: 'Overdue', icon: AlertTriangle },
  met: { variant: 'success', label: 'Met SLA', icon: CheckCircle2 },
  breached: { variant: 'danger', label: 'SLA breached', icon: AlertTriangle },
}

interface SlaBadgeProps {
  /** The grievance itself, so the badge and the queue filter cannot drift apart. */
  grievance: SlaSubject
  now?: Date
}

export function SlaBadge({ grievance, now }: SlaBadgeProps) {
  const state = computeSlaState(grievance, now)
  const { variant, label, icon: Icon } = SLA_META[state]
  return (
    <Badge variant={variant} icon={<Icon aria-hidden className="size-3.5" />}>
      {label}
    </Badge>
  )
}
