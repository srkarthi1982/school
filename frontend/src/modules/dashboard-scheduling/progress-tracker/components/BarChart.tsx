import { CourseProgress, type TeacherCourseProgress } from '../store'
import { getColorById } from '../utils'

function BarChart({ courses }: { courses: (CourseProgress | TeacherCourseProgress)[] }) {
  const categories = [
    { key: 'attendance' as const, label: 'Attendance', color: 'var(--accent)' },
    { key: 'quizzes' as const, label: 'Quizzes', color: '#6366F1' },
    { key: 'materials' as const, label: 'Materials', color: '#F59E0B' },
  ] as const

  function getValue(course: CourseProgress | TeacherCourseProgress, key: 'attendance' | 'quizzes' | 'materials'): number {
    if ('attendanceRate' in course) {
      const c = course as CourseProgress
      if (key === 'attendance') return c.attendanceRate
      if (key === 'quizzes') return c.assessmentAverage
      return c.materialsCompletionRate
    } else {
      const c = course as TeacherCourseProgress
      if (key === 'attendance') return c.averageAttendanceRate
      if (key === 'quizzes') return c.averageAssessmentScore
      return c.averageMaterialsCompletionRate
    }
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-2">
        {courses.map((course) => (
          <div key={course.courseId} className="flex items-center gap-3">
            {/* Lesson name label */}
            <div className="w-32 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getColorById(course.courseId) }} />
                <span className="text-[11px] font-medium text-primary truncate">{course.courseName}</span>
              </div>
            </div>
            {/* Bars for each category */}
            {categories.map((cat) => {
              const value = getValue(course, cat.key)
              return (
                <div key={cat.key} className="flex-1 flex items-center gap-1.5">
                  <div className="flex-1 h-[18px] bg-surface-2 rounded-full overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${value}%`, background: cat.color }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted w-8 text-right">{value}%</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {/* Category legend */}
      <div className="flex gap-4 mt-4 pt-3 border-t border-bd">
        {categories.map((cat) => (
          <div key={cat.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: cat.color }} />
            <span className="text-[11px] text-muted">{cat.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BarChart
