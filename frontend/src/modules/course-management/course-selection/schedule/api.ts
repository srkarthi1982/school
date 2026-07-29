// Course Selection (instance) Schedule API. Mirrors the master schedule but
// targets the instance endpoints `/api/v1/course-selection-schedules`, and
// drives the shared schedule store + lesson-detail cache via injected adapters.
import { client } from '../../../../api/client'
import type { ScheduleApi } from '../../_shared/schedule-store'
import type { LessonDetailApi } from '../../_shared/lesson-detail-cache'
import { getLessonCreation, listLessonResourceOptions } from '../course-info/api'

const BASE = '/api/v1/course-selection-schedules'

// Endpoint adapter for the shared schedule store. The instance also persists
// the calendar (start date / off weekdays / holidays) chosen in "Generate
// dates", so `save` merges it into the request body.
export const instanceScheduleApi: ScheduleApi = {
  ensure: (id) => (client as any).post({ url: `${BASE}/${id}/ensure` }),
  save: (id, payload, calendar) =>
    (client as any).put({
      url: `${BASE}/${id}`,
      body: { ...payload, calendar },
      headers: { 'Content-Type': 'application/json' },
    }),
}

// Lesson-detail popup data source: the instance's own lessons + resources.
// Objective dictionaries are global master picklists (handled by the cache).
export const instanceLessonDetailApi: LessonDetailApi = {
  scope: 'instance',
  getLessonCreation,
  listLessonResourceOptions,
}
