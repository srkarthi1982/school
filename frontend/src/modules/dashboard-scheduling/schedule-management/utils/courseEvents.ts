// Transform a Course SESSION schedule detail into read-only calendar events for
// Schedule Management. Each placed lesson block becomes one event on a real date
// (the session schedule's stored per-day date, or the shared calendar walk as a
// fallback) at a FREE-FORM time: start_minute (minutes from midnight) for
// duration_minute. Events reuse the ScheduleEntry shape so the existing
// Week/Day/Month views render them unchanged.
import type {
  AppModulesCourseSelectionScheduleSchemasScheduleConfig as ScheduleConfig,
  ScheduleCalendar as ApiScheduleCalendar,
  ScheduleLessonItem,
} from '../../../../api/generated'
import { nthAvailableDate, parseISODate, type ScheduleCalendar } from '../../../../infra/shared/utils/scheduleCalendar'
import type { ImportanceLevel, ScheduleEntry } from '../types'

// Course events carry no importance; this is only to satisfy the shared shape
// (the block hides the badge in read-only course mode).
const COURSE_EVENT_IMPORTANCE: ImportanceLevel = 5

// --- Local session-schedule DTO shapes ---------------------------------------
// The session schedule is fetched with a raw (untyped) client call to avoid an
// SDK regen, so we type it here. Unlike the selection schedule, a placement is
// FREE-FORM time (startMinute + durationMinute), not period columns.
export interface SessionPlacementItem {
  id?: number | null
  lessonId: number
  startMinute: number
  durationMinute: number
  description?: string | null
  remarks?: string | null
}

export interface SessionScheduleDay {
  id?: number | null
  dayLabel?: string | null
  date?: string | null
  items?: SessionPlacementItem[]
}

export interface CourseSessionScheduleDetail {
  id: number
  courseInstanceId: number
  courseTitle?: string | null
  courseDate?: string | null
  status: string
  available?: boolean
  config?: ScheduleConfig
  calendar?: ApiScheduleCalendar
  lessons?: ScheduleLessonItem[]
  days?: SessionScheduleDay[]
  lastModifiedByName?: string | null
  lastModifiedAt?: string | null
}

export function buildCourseEvents(dto: CourseSessionScheduleDetail, courseId: number): ScheduleEntry[] {
  const cal: ScheduleCalendar = {
    startDate: dto.calendar?.startDate ?? null,
    offWeekdays: dto.calendar?.offWeekdays ?? [],
    holidays: dto.calendar?.holidays ?? [],
  }
  const lessonsById = new Map((dto.lessons ?? []).map((l) => [l.id, l]))

  const events: ScheduleEntry[] = []
  let seq = 1
  const days = dto.days ?? []
  for (let i = 0; i < days.length; i++) {
    // Real date of this day row: prefer the session schedule's stored per-day
    // date (editable, decoupled from the calendar formula); fall back to the
    // computed calendar walk for un-dated days.
    const stored = days[i].date
    const date = stored ? parseISODate(stored) : nthAvailableDate(i, cal)
    if (!date) continue
    for (const p of days[i].items ?? []) {
      const start = new Date(date)
      // setHours normalizes minute overflow, so startMinute rolls into hours.
      start.setHours(0, p.startMinute, 0, 0)
      const end = new Date(start.getTime() + Math.max(1, p.durationMinute) * 60000)
      const lesson = lessonsById.get(p.lessonId)
      const title = lesson?.lessonTitle || p.description || lesson?.lessonNumber || 'Lesson'
      events.push({
        id: seq++,
        version: 0,
        course_id: courseId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        title,
        description: p.description ?? '',
        importance: COURSE_EVENT_IMPORTANCE,
        lessonId: p.lessonId,
        lessonNumber: lesson?.lessonNumber ?? null,
        placementId: p.id ?? null,
      })
    }
  }
  return events
}

// Return a shallow copy of the schedule DTO with one placement moved to a new
// day row / start time / duration. Used for optimistic UI on drag & resize: the
// block stays where the user dropped it while the server round-trip runs in the
// background, instead of snapping back until the response arrives. Unknown
// placement id or out-of-range day index → the original DTO is returned.
export function applyOptimisticMove(
  dto: CourseSessionScheduleDetail,
  placementId: number,
  dayIndex: number,
  startMinute: number,
  durationMinute: number,
): CourseSessionScheduleDetail {
  const days = (dto.days ?? []).map((d) => ({ ...d, items: [...(d.items ?? [])] }))
  let moved: SessionPlacementItem | undefined
  for (const d of days) {
    const idx = d.items.findIndex((p) => p.id === placementId)
    if (idx >= 0) {
      moved = d.items[idx]
      d.items.splice(idx, 1)
      break
    }
  }
  if (!moved || dayIndex < 0 || dayIndex >= days.length) return dto
  days[dayIndex].items.push({ ...moved, startMinute, durationMinute })
  return { ...dto, days }
}

// Return a copy of the schedule DTO with a brand-new placement appended to a day
// row. Used for optimistic UI on add-lesson: the block appears immediately with
// a temporary (negative) id while the POST runs; the reconciling re-read then
// swaps in the server's real placement. Out-of-range day index → original DTO.
export function applyOptimisticAdd(
  dto: CourseSessionScheduleDetail,
  lessonId: number,
  dayIndex: number,
  startMinute: number,
  durationMinute: number,
  tempId: number,
): CourseSessionScheduleDetail {
  if (dayIndex < 0 || dayIndex >= (dto.days?.length ?? 0)) return dto
  const placement: SessionPlacementItem = {
    id: tempId,
    lessonId,
    startMinute,
    durationMinute,
    description: null,
  }
  const days = (dto.days ?? []).map((d, i) =>
    i === dayIndex
      ? { ...d, items: [...(d.items ?? []), placement] }
      : { ...d, items: [...(d.items ?? [])] },
  )
  return { ...dto, days }
}
