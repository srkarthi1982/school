import type { ImportanceLevel } from '../types'

export interface ImportancePalette {
  bg: string
  text: string
  stripe: string
  bgDeep: string
}

export function importancePalette(level: number): ImportancePalette {
  if (level <= 3) return { bg: '#ECFDF5', text: '#047857', stripe: '#10B981', bgDeep: '#10B981' }
  if (level <= 6) return { bg: '#FFFBEB', text: '#B45309', stripe: '#F59E0B', bgDeep: '#F59E0B' }
  if (level <= 8) return { bg: '#FFF7ED', text: '#C2410C', stripe: '#F97316', bgDeep: '#F97316' }
  return { bg: '#FEF2F2', text: '#B91C1C', stripe: '#EF4444', bgDeep: '#EF4444' }
}

interface Props {
  level: ImportanceLevel | number
  size?: 'xs' | 'sm'
}

export default function ImportanceBadge({ level, size = 'xs' }: Props) {
  const p = importancePalette(level)
  const sz = size === 'xs'
    ? 'text-[9.5px] px-1.5 py-0 h-[15px]'
    : 'text-[11px] px-2 py-0.5 h-[18px]'
  return (
    <span
      className={`inline-flex items-center justify-center font-bold rounded-full leading-none ${sz}`}
      style={{ background: p.bg, color: p.text }}
      aria-label={`Importance ${level} of 10`}
    >
      {level}
    </span>
  )
}
