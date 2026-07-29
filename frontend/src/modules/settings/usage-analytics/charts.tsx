import type { ReactNode } from 'react'

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</span>
      <span className="text-2xl font-bold text-primary leading-tight">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}

type Pt = { label: string; value: number }

// Single-series area+line. Uses non-scaling-stroke so the line stays crisp when
// the SVG is stretched to full width via preserveAspectRatio="none".
export function AreaChart({ points, height = 140 }: { points: Pt[]; height?: number }) {
  if (points.length === 0) return <ChartEmpty height={height} />
  const max = Math.max(1, ...points.map((p) => p.value))
  const w = Math.max(points.length - 1, 1)
  const padY = 6
  const inner = height - padY * 2
  const x = (i: number) => i
  const y = (v: number) => padY + inner - (v / max) * inner

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  const area = `${x(0)},${height} ${line} ${x(points.length - 1)},${height}`

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <polygon points={area} fill="var(--accent)" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} fill="var(--accent)" vectorEffect="non-scaling-stroke">
          <title>{`${p.label}: ${p.value}`}</title>
        </circle>
      ))}
    </svg>
  )
}

export function BarChart({ points, height = 140 }: { points: Pt[]; height?: number }) {
  if (points.length === 0) return <ChartEmpty height={height} />
  const max = Math.max(1, ...points.map((p) => p.value))
  const n = points.length
  const gap = 0.18
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${n} ${height}`} preserveAspectRatio="none">
      {points.map((p, i) => {
        const h = (p.value / max) * (height - 4)
        return (
          <rect
            key={i}
            x={i + gap}
            y={height - h}
            width={1 - gap * 2}
            height={h}
            rx={0.06}
            fill="var(--accent)"
            opacity={0.85}
          >
            <title>{`${p.label}: ${p.value}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

// Inline horizontal proportion bar for table cells (reach visualisation).
export function InlineBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 rounded-full bg-surface-2 flex-1 min-w-[40px] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
      <span className="text-xs text-secondary tabular-nums w-8 text-end">{value}</span>
    </div>
  )
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-xs text-muted" style={{ height }}>
      No data in range
    </div>
  )
}
