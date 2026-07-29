import type { ReactNode } from 'react'

export const DAYS_OF_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

// Convert JS DayIndex (0=Sun, 1=Mon, ..., 6=Sat) to grid index (0=Mon, 1=Tue, ..., 5=Sat, 6=Sun)
export function jsDayToGridIdx(jsIdx: number): number {
  return (jsIdx - 1 + 7) % 7
}

export function isActive(val: unknown, active: unknown): boolean {
  return val === active
}

export const ATTENDANCE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  present: { bg: 'rgba(34,197,94,0.15)', text: '#16A34A' },
  absent: { bg: 'rgba(220,38,38,0.12)', text: '#DC2626' },
  late: { bg: 'rgba(245,158,11,0.15)', text: '#D97706' },
  excused: { bg: 'rgba(59,130,246,0.12)', text: '#2563EB' },
  simulation: { bg: 'rgba(139,92,246,0.15)', text: '#7C3AED' },
  flying: { bg: 'rgba(14,165,233,0.15)', text: '#0284C7' },
}

export const MATERIAL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  completed: { bg: 'rgba(34,197,94,0.12)', text: '#16A34A' },
  'in-progress': { bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
  'not-started': { bg: 'var(--surface-2)', text: 'var(--text-muted)' },
}

export const ASSESSMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  completed: { bg: 'rgba(34,197,94,0.12)', text: '#16A34A' },
  pending: { bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
  missing: { bg: 'rgba(220,38,38,0.12)', text: '#DC2626' },
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function scoreColor(score: number): string {
  if (score >= 80) return '#16A34A'
  if (score >= 60) return '#D97706'
  return '#DC2626'
}
// Palette of colors that work in both light/dark modes
export const COURSE_COLOR_PALETTE = [
  '#0D9488',//Teal
  '#4F46E5',//Indigo
  '#F59E0B',//Amber
  '#10B981',//Emerald
  '#DC2626',//Red
  '#7C3AED',//Violet
  '#F97316',//Orange
  '#0891B2',//Cyan
  '#BE185D',//Rose
  '#6366F1',//Periwinkle
  '#CA8A04',//Gold
  '#059669',//Green
  '#E11D48',//Pink Red
  '#2563EB',//Blue
  '#9333EA',//Purple
  '#D946EF',//Fuchsia
  '#854D0E',//Dark Yellow/Ochre
  '#065F46',//Forest
  '#1E3A5F',//Navy Blue
  '#64748B',//Slate
  '#78716C',//Stone
  '#A16207',//Bronze
  '#B91C1C',//Crimson
  '#0E7490',//Deep Cyan
  '#5B21B6',//Deep Violet
  '#C2410C',//Rust
  '#047857',//Dark Emerald
  '#1D4ED8',//Dark Blue
  '#881337',//Burgundy
  '#475569',//Cool Gray
]



// Generate consistent color from course ID/name
export function getColorById(id: number): string {
  return COURSE_COLOR_PALETTE[id % COURSE_COLOR_PALETTE.length]
}

// Hex to 8-digit hex with alpha (for transparent backgrounds)
export function hexToAlpha8(hex: string, alpha: number = 0.1): string {
  if (!hex.startsWith('#')) return `${hex}18` // pass through CSS variables
  const byte = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `${hex}${byte}`
}