import { cn } from '@/lib/cn'
import { computeSlaState, type SlaSubject } from './sla'

/**
 * The statutory clock, as a ring.
 *
 * A row of badges tells an officer what state a case is in. This tells them how much
 * time is left, which is the thing the product is actually sold on, and it does it
 * without being read.
 *
 * Pure SVG with a `stroke-dasharray`, no JavaScript, no charting library. It renders
 * identically in a Server Component, in a print stylesheet, and with scripting off.
 *
 * The label is not decorative: colour alone would fail anyone with a colour vision
 * deficiency, and this is a tool where "how late is this" must never depend on being
 * able to tell amber from red.
 */

interface SlaRingProps {
  grievance: SlaSubject
  now?: Date
  size?: number
  className?: string
}

const CIRCUMFERENCE_AT_R = (r: number) => 2 * Math.PI * r

export function SlaRing({ grievance, now = new Date(), size = 44, className }: SlaRingProps) {
  const state = computeSlaState(grievance, now)

  const stroke = size < 40 ? 3 : 4
  const r = (size - stroke) / 2 - 1
  const c = CIRCUMFERENCE_AT_R(r)

  const { fraction, label, hint } = describe(grievance, now, state)

  // Ring fills clockwise from the top as the window is consumed.
  const dashOffset = c * (1 - Math.min(1, Math.max(0, fraction)))

  const tone =
    state === 'overdue' || state === 'breached'
      ? 'text-status-danger-fg'
      : state === 'due_soon'
        ? 'text-status-warning-fg'
        : state === 'met'
          ? 'text-status-success-fg'
          : 'text-status-info-fg'

  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      // One accessible name for the whole thing. The ring and the number are two
      // renderings of the same fact, so a screen reader should hear it once.
      role="img"
      aria-label={hint}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn('shrink-0 -rotate-90', tone)}
        aria-hidden
        focusable="false"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="opacity-15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          className={cn(
            'transition-[stroke-dashoffset] duration-slow ease-out-quint',
            (state === 'overdue' || state === 'breached') && 'animate-ring-pulse',
          )}
        />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className={cn('text-sm font-semibold tabular-nums', tone)}>{label}</span>
        <span className="text-[11px] text-fg-muted">{state === 'no_sla' ? 'no clock' : 'statutory'}</span>
      </span>
    </span>
  )
}

function describe(
  g: SlaSubject,
  now: Date,
  state: ReturnType<typeof computeSlaState>,
): { fraction: number; label: string; hint: string } {
  if (!g.dueAt) return { fraction: 0, label: '—', hint: 'No statutory deadline set' }

  const due = g.dueAt.getTime()
  const start = g.createdAt.getTime()
  const total = Math.max(1, due - start)
  const elapsed = now.getTime() - start
  const days = (ms: number) => Math.max(0, Math.round(ms / 86_400_000))

  if (state === 'met') {
    return { fraction: 1, label: 'met', hint: 'Resolved within the statutory deadline' }
  }
  if (state === 'breached') {
    return { fraction: 1, label: 'missed', hint: 'Resolved after the statutory deadline had passed' }
  }
  if (state === 'overdue') {
    const over = days(now.getTime() - due)
    return {
      // A full ring, because the window is gone. How far past is the number's job.
      fraction: 1,
      label: `+${over}d`,
      hint: `Overdue by ${over} day${over === 1 ? '' : 's'} against the statutory deadline`,
    }
  }

  const left = days(due - now.getTime())
  return {
    fraction: elapsed / total,
    label: `${left}d`,
    hint: `${left} day${left === 1 ? '' : 's'} left before the statutory deadline`,
  }
}
