import { Route, Routes } from 'react-router-dom'
import ScheduleManagementPage from './ScheduleManagementPage'
import LessonDetailPage from './lesson-detail/LessonDetailPage'

// Wildcard-routed feature: the manifest registers
// `/dashboard-scheduling/schedule-management/*` and this component dispatches the
// calendar (index) and the read-only lesson detail page locally.
export default function ScheduleManagementRoutes() {
  return (
    <Routes>
      <Route index element={<ScheduleManagementPage />} />
      <Route
        path="course/:courseInstanceId/lesson/:lessonId"
        element={<LessonDetailPage />}
      />
    </Routes>
  )
}
