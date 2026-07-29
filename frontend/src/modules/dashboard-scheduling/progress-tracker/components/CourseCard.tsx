import { HiMiniSquares2X2 } from 'react-icons/hi2'
import type { CourseProgress } from '../store'
import { getColorById } from '../utils'

function CourseCard({
  course,
  onDrill,
}: {
  course: CourseProgress
  onDrill: () => void
}) {
  return (
    <button
      onClick={onDrill}
      className="card px-5 py-5 flex flex-col gap-3 w-full text-start hover:shadow-md transition-shadow cursor-pointer border border-transparent hover:border-bd"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-[8px] flex items-center justify-center text-[16px] font-bold text-white shrink-0"
            style={{ background: getColorById(course.courseId) }}
          >
            {course.courseName.charAt(0)}
          </div>
          <div>
            <p className="text-[13.5px] font-semibold text-primary">{course.courseName}</p>
            <p className="text-[11px] text-muted">Instructor: {course.teacherName}</p>
          </div>
        </div>
        <HiMiniSquares2X2 className="text-muted text-lg shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Attendance</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[5px] bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${course.attendanceRate}%`, background: '#16A34A' }} />
            </div>
            <span className="text-[11px] font-semibold text-secondary">{course.attendanceRate}%</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Quizzes</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[5px] bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${course.assessmentAverage}%`, background: '#6366F1' }} />
            </div>
            <span className="text-[11px] font-semibold text-secondary">{course.assessmentAverage}%</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Materials</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-[5px] bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${course.materialsCompletionRate}%`, background: '#F59E0B' }} />
            </div>
            <span className="text-[11px] font-semibold text-secondary">{course.materialsCompleted}/{course.materialsTotal}</span>
          </div>
        </div>
      </div>
    </button>
  )
}

export default CourseCard
