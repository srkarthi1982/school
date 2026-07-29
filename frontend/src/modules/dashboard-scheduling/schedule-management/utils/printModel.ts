// Adapt an operational (session) course schedule into the period-grid model the
// shared "Course Model Programme" print builder expects. The session schedule
// stores each placement at a FREE-FORM time (startMinute + durationMinute); the
// printed Programme is a period grid (startCol + span), so we snap each block to
// the nearest period column relative to the working-day start. Day labels are
// real calendar dates (the stored per-day date, or the calendar walk fallback),
// mirroring Course Selection's dated schedule print.
import type {
  ScheduleConfig,
  ScheduleDay,
  ScheduleLesson,
} from '../../../course-management/_shared/schedule-store'
import {
  dayLabelFor,
  formatDayLabel,
  parseISODate,
  type ScheduleCalendar,
} from '../../../../infra/shared/utils/scheduleCalendar'
import type { CourseSessionScheduleDetail } from './courseEvents'

const DEFAULT_CONFIG: ScheduleConfig = {
  periodsPerDay: 6,
  totalTrainingDays: 5,
  trainingDaysPerWeek: 5,
  periodsPerHalfDay: 3,
  periodDurationMinutes: 45,
}

// "HH:MM" → minutes from midnight; falls back to 08:00 when unset/invalid.
function dayStartMinuteOf(config: ScheduleConfig & { dayStartTime?: string | null }): number {
  const hhmm = config.dayStartTime
  if (hhmm) {
    const [h, m] = hhmm.split(':').map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m
  }
  return 480
}

export interface SessionPrintModel {
  courseTitle: string
  days: ScheduleDay[]
  lessonsById: Record<string, ScheduleLesson>
  config: ScheduleConfig
}

export function sessionScheduleToPrintModel(dto: CourseSessionScheduleDetail): SessionPrintModel {
  const config: ScheduleConfig = { ...DEFAULT_CONFIG, ...(dto.config ?? {}) }
  const periodDur = Math.max(1, config.periodDurationMinutes)
  const dayStart = dayStartMinuteOf(config)

  const cal: ScheduleCalendar = {
    startDate: dto.calendar?.startDate ?? null,
    offWeekdays: dto.calendar?.offWeekdays ?? [],
    holidays: dto.calendar?.holidays ?? [],
  }

  const lessonsById: Record<string, ScheduleLesson> = {}
  for (const l of dto.lessons ?? []) {
    lessonsById[String(l.id)] = {
      id: String(l.id),
      lessonNumber: l.lessonNumber ?? '',
      lessonTitle: l.lessonTitle ?? '',
      environmentLabel: l.environmentLabel ?? null,
      periodTypeLabel: l.periodTypeLabel ?? null,
      periods: l.periods ?? 0,
      periodPerUnit: l.periodPerUnit ?? 0,
    }
  }

  const days: ScheduleDay[] = (dto.days ?? []).map((d, i) => {
    // Real date: prefer the stored per-day date, else the calendar walk.
    const dayLabel = d.date
      ? formatDayLabel(parseISODate(d.date))
      : dayLabelFor(i, cal)
    const items = (d.items ?? []).map((p, j) => ({
      id: String(p.id ?? `${i}-${j}`),
      lessonId: String(p.lessonId),
      // Snap the free-form time onto the period lane so the grid can render it.
      startCol: Math.max(0, Math.round((p.startMinute - dayStart) / periodDur)),
      span: Math.max(1, Math.round(p.durationMinute / periodDur)),
    }))
    return { id: String(d.id ?? i), dayLabel, items }
  })

  return {
    courseTitle: dto.courseTitle || 'Untitled course',
    days,
    lessonsById,
    config,
  }
}
