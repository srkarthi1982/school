import { useNavigate } from 'react-router-dom'
import useScheduleManagementStore, { selectIsCourseView } from './store'
import type { ScheduleEntry } from './types'

// Build the route to a lesson's full detail page (read-only) within Schedule
// Management. Shared so the views and the lesson page agree on the URL shape.
export function lessonDetailPath(
  courseInstanceId: number,
  lessonId: number,
  // Session context from the clicked calendar block: the concrete placement (one
  // lesson can be placed in many sessions) and its date. Carried so the lesson
  // page can scope "Capture attendance" to this exact session.
  session?: { placementId?: number | null; date?: string | null },
): string {
  const base = `/dashboard-scheduling/schedule-management/course/${courseInstanceId}/lesson/${lessonId}`
  const q = new URLSearchParams()
  if (session?.placementId != null) q.set('placementId', String(session.placementId))
  if (session?.date) q.set('date', session.date)
  const qs = q.toString()
  return qs ? `${base}?${qs}` : base
}

/**
 * What clicking a calendar entry does, unified across Day/Week/Month views:
 *  - personal schedule → open the edit modal (existing behaviour)
 *  - course schedule    → navigate to the lesson's full detail page (if the
 *                         block maps to a lesson; course events always do)
 */
export function useEntryAction(): (entry: ScheduleEntry) => void {
  const navigate = useNavigate()
  const isCourseView = useScheduleManagementStore(selectIsCourseView)
  const openEdit = useScheduleManagementStore((s) => s.openEdit)

  return (entry: ScheduleEntry) => {
    if (isCourseView) {
      if (entry.lessonId != null && entry.course_id != null) {
        navigate(
          lessonDetailPath(entry.course_id, entry.lessonId, {
            placementId: entry.placementId,
            // startAt is the session's concrete date (UTC ISO); take the date part.
            date: entry.startAt ? entry.startAt.slice(0, 10) : null,
          }),
        )
      }
      return
    }
    openEdit(entry.id)
  }
}
