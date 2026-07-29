export type ImportanceLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export type ViewMode = 'day' | 'week' | 'month'

export interface Course {
  id: number
  code: string
  name: string
}

// A course instance the current user is a member of, for the read-only course
// schedule viewer's picker. Distinct from `Course` (the personal-entry seed list).
export interface ScheduleCourse {
  id: number
  title: string
  startDate: string | null
  endDate: string | null
  status: string
  role: 'student' | 'instructor'
}

export interface ScheduleEntry {
  id: number
  version: number
  course_id: number | null
  startAt: string
  endAt: string
  title: string
  description: string
  importance: ImportanceLevel
  // Set only on read-only course events: the instance lesson this block teaches,
  // so clicking it can open the full lesson detail page. Null for personal entries.
  lessonId?: number | null
  // Lesson code (lesson_number) for the block — shown alongside the title and
  // matched by the lesson search. Null for personal entries.
  lessonNumber?: string | null
  // The course-schedule placement this event maps back to — lets a teacher's
  // move/resize on the calendar persist to the right placement. Null for personal.
  placementId?: number | null
}

export interface ScheduleEntryInput {
  course_id: number | null
  startAt: string
  endAt: string
  title: string
  description: string
  importance: ImportanceLevel
}
