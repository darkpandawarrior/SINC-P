import {
  Inbox,
  Search,
  Clock3,
  CheckCircle2,
  CheckCheck,
  XCircle,
  Undo2,
  ArrowUpCircle,
} from 'lucide-react'
import type { Status } from '@/lib/grievance/policy'
import { Badge, type BadgeVariant } from './Badge'

/**
 * Colour alone can't carry status here — a colour-blind reader gets nothing from a
 * red dot. Every status pairs a hue family with a distinct icon shape and its own
 * text label, so the signal survives even in greyscale.
 */
const STATUS_META: Record<Status, { variant: BadgeVariant; label: string; icon: typeof Inbox }> = {
  submitted: { variant: 'neutral', label: 'Submitted', icon: Inbox },
  under_review: { variant: 'info', label: 'Under review', icon: Search },
  in_progress: { variant: 'info', label: 'In progress', icon: Clock3 },
  resolved: { variant: 'success', label: 'Resolved', icon: CheckCircle2 },
  closed: { variant: 'successStrong', label: 'Closed', icon: CheckCheck },
  rejected: { variant: 'danger', label: 'Rejected', icon: XCircle },
  withdrawn: { variant: 'neutralMuted', label: 'Withdrawn', icon: Undo2 },
  appealed: { variant: 'escalate', label: 'Appealed', icon: ArrowUpCircle },
}

export function StatusPill({ status }: { status: Status }) {
  const { variant, label, icon: Icon } = STATUS_META[status]
  return (
    <Badge variant={variant} icon={<Icon aria-hidden className="size-3.5" />}>
      {label}
    </Badge>
  )
}
