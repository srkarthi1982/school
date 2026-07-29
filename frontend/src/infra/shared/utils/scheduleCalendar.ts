// Calendar math shared by the Course Builder/Selection schedule editor and the
// Schedule Management course viewer. Maps a 0-based day-row index to a real
// calendar date by walking forward from a start date, skipping off-weekdays
// (Python convention: Mon=0 … Sun=6) and specific holiday dates.

export interface ScheduleCalendar {
  // ISO yyyy-mm-dd of the first training day; null = no dates yet → "Day N".
  startDate: string | null
  // Weekday numbers that are days off, Python convention (Mon=0 … Sun=6).
  offWeekdays: number[]
  // Specific ISO dates to skip.
  holidays: string[]
}

export const EMPTY_CALENDAR: ScheduleCalendar = { startDate: null, offWeekdays: [], holidays: [] }

export function isoOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

// JS getDay() is 0=Sun…6=Sat; convert to Python weekday 0=Mon…6=Sun.
export function pyWeekday(d: Date): number {
  return (d.getDay() + 6) % 7
}

export function isDayOff(d: Date, cal: ScheduleCalendar): boolean {
  if (cal.offWeekdays.includes(pyWeekday(d))) return true
  return cal.holidays.includes(isoOf(d))
}

// The date of the `index`-th (0-based) AVAILABLE day from startDate, skipping
// off-weekdays and holidays. Returns null if startDate is unset.
export function nthAvailableDate(index: number, cal: ScheduleCalendar): Date | null {
  if (!cal.startDate) return null
  const cur = parseISODate(cal.startDate)
  let count = -1
  for (let guard = 0; guard < 4000; guard++) {
    if (!isDayOff(cur, cal)) {
      count++
      if (count === index) return new Date(cur)
    }
    cur.setDate(cur.getDate() + 1)
  }
  return null
}

// Inverse of nthAvailableDate: the 0-based AVAILABLE-day index of `date` from
// startDate, or null if `date` is before the start or falls on a day off. Used
// to map a calendar drop back to a schedule day row.
export function availableDayIndexOf(date: Date, cal: ScheduleCalendar): number | null {
  if (!cal.startDate) return null
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (isDayOff(target, cal)) return null
  const cur = parseISODate(cal.startDate)
  if (target.getTime() < cur.getTime()) return null
  let count = 0
  for (let guard = 0; guard < 4000; guard++) {
    if (cur.getTime() === target.getTime()) return count
    if (!isDayOff(cur, cal)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return null
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// Display label for the day row at `index`: a real date when a calendar is set,
// otherwise the "Day N" fallback (Course Builder + un-generated instances).
export function dayLabelFor(index: number, cal: ScheduleCalendar | null | undefined): string {
  if (cal?.startDate) {
    const d = nthAvailableDate(index, cal)
    if (d) return formatDayLabel(d)
  }
  return `Day ${index + 1}`
}
