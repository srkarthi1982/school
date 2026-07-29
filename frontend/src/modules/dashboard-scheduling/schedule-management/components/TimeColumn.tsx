import { PIXELS_PER_HOUR } from '../utils/dragHelpers'

interface Props {
  fromHour?: number
  toHour?: number
}

export default function TimeColumn({ fromHour = 0, toHour = 24 }: Props) {
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i)
  return (
    <div className="shrink-0 w-14 border-e border-[var(--border)] relative bg-[var(--surface)]">
      {hours.map((h) => (
        <div
          key={h}
          className="text-[10px] text-[var(--text-muted)] font-medium tabular-nums px-2 pt-0.5 absolute end-0 -translate-y-1/2 select-none"
          style={{ top: (h - fromHour) * PIXELS_PER_HOUR }}
        >
          {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
        </div>
      ))}
    </div>
  )
}
