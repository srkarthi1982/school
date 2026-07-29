export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

export function startOfMonth(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return x
}

export function addMinutes(d: Date, n: number): Date {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() + n)
  return x
}

export function isoDate(d: Date): string {
  return d.toISOString()
}

export function toLocalISO(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

export function fromLocalISO(s: string): Date {
  return new Date(s)
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

export function diffMinutes(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatWeekRange(d: Date): string {
  const start = startOfWeek(d)
  const end = addDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const sameYear = start.getFullYear() === end.getFullYear()
  const startStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: sameYear ? 'numeric' : 'numeric',
  })
  return `${startStr} – ${endStr}, ${end.getFullYear()}`
}

export function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function buildMonthCells(d: Date): Date[] {
  const start = startOfMonth(d)
  const day = start.getDay()
  const offset = day === 0 ? -6 : 1 - day
  const gridStart = addDays(start, offset)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i))
  return cells
}

export function weekdayLabels(): string[] {
  const base = startOfWeek(new Date())
  return Array.from({ length: 7 }, (_, i) =>
    addDays(base, i).toLocaleDateString(undefined, { weekday: 'short' })
  )
}

export interface ScheduleEntrySegment {
  dayKey: string
  startAtMs: number
  endAtMs: number
  isHead: boolean
  isTail: boolean
}

/**
 * Split a entry that may cross midnight into one segment per day.
 * Each segment is clipped to its day's [00:00, 24:00] bounds. Single-day
 * entries return a single segment with isHead && isTail.
 */
export function splitEntryIntoSegments(startAtISO: string, endAtISO: string): ScheduleEntrySegment[] {
  const startMs = new Date(startAtISO).getTime()
  const endMs   = new Date(endAtISO).getTime()
  if (endMs <= startMs) return []

  const segments: ScheduleEntrySegment[] = []
  let cursorMs = startMs

  while (cursorMs < endMs) {
    const cursorDate = new Date(cursorMs)
    const nextMidnight = new Date(cursorDate)
    nextMidnight.setHours(24, 0, 0, 0)
    const nextMidnightMs = nextMidnight.getTime()
    const segEnd = Math.min(endMs, nextMidnightMs)

    segments.push({
      dayKey: dayKey(cursorDate),
      startAtMs: cursorMs,
      endAtMs: segEnd,
      isHead: cursorMs === startMs,
      isTail: segEnd === endMs,
    })
    cursorMs = segEnd
  }

  return segments
}
