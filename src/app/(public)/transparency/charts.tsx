/**
 * Plain inline SVG, no charting library — next.config.ts's CSP has no allowance for an
 * external script or stylesheet, and a chart library would be a lot of dependency for
 * two shapes. Every chart here is decorative: the numbers it draws also exist in a real
 * <table> right below it, which is what a screen reader actually gets. `aria-hidden` on
 * the SVG is deliberate — describing bars in an aria-label duplicates the table badly
 * once there's more than a couple of points, and the table already carries the meaning.
 */
interface BarDatum {
  label: string
  value: number | null
}

const SUPPRESSED_LABEL = 'suppressed (< 5)'

export function CategoryBarChart({ data, unit }: { data: BarDatum[]; unit: string }) {
  if (data.length === 0) return null

  const barHeight = 22
  const gap = 10
  const rowHeight = barHeight + gap
  const labelWidth = 170
  const chartWidth = 320
  const valueGutter = 90
  const height = data.length * rowHeight
  const width = labelWidth + chartWidth + valueGutter
  const max = Math.max(1, ...data.map((d) => d.value ?? 0))

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-2xl"
      role="presentation"
    >
      {data.map((d, i) => {
        const y = i * rowHeight
        const barWidth = d.value === null ? 0 : Math.max((d.value / max) * chartWidth, 2)
        return (
          <g key={d.label}>
            <text
              x={labelWidth - 8}
              y={y + barHeight / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-fg-muted text-[11px]"
            >
              {d.label}
            </text>
            <rect
              x={labelWidth}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={3}
              className={d.value === null ? 'fill-status-neutral-muted-bg' : 'fill-accent'}
            />
            <text
              x={labelWidth + barWidth + 8}
              y={y + barHeight / 2}
              dominantBaseline="middle"
              className="fill-fg text-[11px]"
            >
              {d.value === null ? SUPPRESSED_LABEL : `${d.value}${unit}`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

interface LinePoint {
  label: string
  value: number | null
}

/** A single trend line. Suppressed points break the line rather than plotting as zero —
 *  a dip to zero would read as "this month had none", which is a different, false claim
 *  from "this month is too small to publish". */
export function TrendLineChart({ points, unit }: { points: LinePoint[]; unit: string }) {
  if (points.length === 0) return null

  const width = 480
  const height = 160
  const padding = { top: 16, right: 16, bottom: 28, left: 16 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const max = Math.max(1, ...points.map((p) => p.value ?? 0))
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0

  const coords = points.map((p, i) => ({
    x: padding.left + i * stepX,
    y: p.value === null ? null : padding.top + plotHeight - (p.value / max) * plotHeight,
    value: p.value,
    label: p.label,
  }))

  // Break the polyline at every suppressed point instead of drawing through it.
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []
  for (const c of coords) {
    if (c.y === null) {
      if (current.length) segments.push(current)
      current = []
    } else {
      current.push({ x: c.x, y: c.y })
    }
  }
  if (current.length) segments.push(current)

  return (
    <svg aria-hidden role="presentation" viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl">
      <line
        x1={padding.left}
        y1={padding.top + plotHeight}
        x2={width - padding.right}
        y2={padding.top + plotHeight}
        className="stroke-border"
        strokeWidth={1}
      />
      {segments.map((seg, i) => (
        <polyline
          key={i}
          fill="none"
          className="stroke-accent"
          strokeWidth={2}
          points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
        />
      ))}
      {coords.map((c) => (
        <g key={c.label}>
          {c.y !== null && <circle cx={c.x} cy={c.y} r={3} className="fill-accent" />}
          <text
            x={c.x}
            y={height - 6}
            textAnchor="middle"
            className="fill-fg-muted text-[10px]"
          >
            {c.label.slice(5)}
          </text>
        </g>
      ))}
      <text x={padding.left} y={12} className="fill-fg-muted text-[10px]">
        {unit}
      </text>
    </svg>
  )
}
