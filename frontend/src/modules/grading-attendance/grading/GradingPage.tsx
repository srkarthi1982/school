import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineAcademicCap, HiOutlineBookOpen, HiOutlineChevronRight, HiOutlineUserCircle } from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import useStore, { TeacherCourse } from './store'
const useGradeStore = useStore

function StatusBadge({ status }: { status: string }) {
  const lc = status.toLowerCase()
  const palette =
    lc === 'draft'
      ? { bg: 'rgba(245,158,11,0.12)', text: '#D97706' }
      : lc === 'published' || lc === 'active' || lc === 'approved'
      ? { bg: 'rgba(34,197,94,0.10)', text: '#16A34A' }
      : { bg: 'rgba(100,116,139,0.10)', text: '#64748B' }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
      style={{ background: palette.bg, color: palette.text }}
    >
      {status}
    </span>
  )
}

export default function GradingPage() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const { courses, getCourses, setSelectedCourse } = useGradeStore(
    useShallow((s) => ({ courses: s.courses, getCourses: s.getCourses, setSelectedCourse: s.setSelectedCourse }))
  )

  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    if (courses.length === 0) {
      getCourses()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (course: TeacherCourse) => {
    setSelected(course.id)
    setSelectedCourse(course)
    setTimeout(() => {
      navigate(`course-pick/${course.id}`)
    }, 0)
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        icon={<HiOutlineAcademicCap />}
        title={t('grading.title')}
        description={t('grading.description')}
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
        {courses.map((course) => (
          <div
            key={course.id}
            className="card px-5 py-4 flex flex-col gap-3 cursor-pointer hover:border-accent transition-colors"
            onClick={() => handleSelect(course)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-bold text-primary leading-snug truncate">
                  {course.title}
                </h3>
              </div>
              <HiOutlineChevronRight className="text-[16px] text-muted shrink-0" />
            </div>

            {course.outline && (
              <p className="text-[12px] text-secondary leading-relaxed line-clamp-2">
                {course.outline}
              </p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[11.5px] text-muted">
                <span>{course.students_count ?? 0} {t('grading.students')}</span>
                {/* <StatusBadge status={course.status} /> */}
              </div>

              {/* <div className="flex items-center gap-2" style={{ minWidth: 120 }} hidden>
                <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden min-w-[60px]">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: `${course.gradingProgress}%`,
                      background: course.gradingProgress === 100
                        ? 'var(--success)'
                        : 'var(--accent)',
                    }}
                  />
                </div>
                <span
                  className={`text-[11px] font-semibold shrink-0 ${
                    course.gradingProgress === 100
                      ? 'text-[var(--success)]'
                      : 'text-muted'
                  }`}
                >
                  {course.gradingProgress}%
                </span>
              </div> */}
            </div>
          </div>
        ))}
      </div>

      {courses.length === 0 && (
        <div className="card px-6 py-10 flex flex-col items-center text-center gap-3">
          <HiOutlineAcademicCap className="text-5.5 text-muted" />
          <p className="text-base font-semibold text-muted">{t('grading.noCourses')}</p>
        </div>
      )}
    </div>
  )
}
