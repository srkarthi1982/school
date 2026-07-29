import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineArrowLeft, HiOutlineUserCircle } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import useStore from '../store'

const TAB_KEYS: ('quiz' | 'survey' | 'form' | 'flight-pack')[] = ['quiz', 'survey', 'form', 'flight-pack']
const TAB_KEYS_STR: Record<'quiz' | 'survey' | 'form' | 'flight-pack', 'grading.quiz' | 'grading.survey' | 'grading.form' | 'grading.flightPack'> = {
  quiz: 'grading.quiz',
  survey: 'grading.survey',
  form: 'grading.form',
  'flight-pack': 'grading.flightPack',
}

export default function CoursePickerPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const {
    selectedCourse,
    students,
    loadStudents,
    getCourses,
    activeTab,
    setActiveTab,
    setSelectedStudent,
    setSelectedCourse,
    courses,
  } = useStore(useShallow((s) => ({
    selectedCourse: s.selectedCourse,
    students: s.students,
    loadStudents: s.loadStudents,
    getCourses: s.getCourses,
    activeTab: s.activeTab,
    setActiveTab: s.setActiveTab,
    setSelectedStudent: s.setSelectedStudent,
    setSelectedCourse: s.setSelectedCourse,
    courses: s.courses,
  })))

  const [localCourse, setLocalCourse] = useState<any>(null)

  // Sync tab from URL query param (e.g., from LessonDetailPage navigation)
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && TAB_KEYS.includes(tab as 'quiz' | 'survey' | 'form' | 'flight-pack')) {
      setActiveTab(tab as 'quiz' | 'survey' | 'form' | 'flight-pack')
      // Clean up the URL after syncing
      const params = new URLSearchParams(searchParams)
      params.delete('tab')
      if (params.toString()) {
        navigate(`${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`, { replace: true })
      } else {
        navigate(window.location.pathname, { replace: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (courseId) {
      loadStudents(Number(courseId))
      getCourses()
    }
  }, [courseId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (courseId && courses.length) {
      const course = courses.find((c: any) => String(c.id) === courseId)
      if (course && (selectedCourse?.id !== course.id)) {
        setSelectedCourse(course)
        setLocalCourse(course)
      }
    }
  }, [courseId, courses, selectedCourse])

  const handleTabSelect = (tab: 'quiz' | 'survey' | 'form' | 'flight-pack') => {
    setActiveTab(tab)
  }

  const handleStudentClick = (studentId: number) => {
    const matchedStudent = students.find((s) => s.id === studentId)
    if (!matchedStudent) return
    setSelectedStudent(matchedStudent)
    if (activeTab === 'flight-pack') {
      navigate('/grading-attendance/grading/course-pick/' + courseId + '/flight-pack')
    } else {
      navigate('/grading-attendance/grading/course-pick/' + courseId + '/' + activeTab + '/' + studentId)
    }
  }

  const handleBack = () => {
    navigate('/grading-attendance/grading')
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-1 bg-transparent border-none cursor-pointer p-0"
      >
        <HiOutlineArrowLeft className="text-[14px]" />
        {t('grading.backToCourses')}
      </button>

      {selectedCourse && (
        <SectionHeader
          icon={<HiOutlineUserCircle />}
          title={selectedCourse.title}
        />
      )}

      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 mb-3">
        {TAB_KEYS.map((key) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleTabSelect(key)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none transition-all duration-150"
              style={{
                background: isActive ? 'var(--accent-light)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {t(TAB_KEYS_STR[key])}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase mb-1">
        {t('grading.studentList')}
      </p>

      {students.length === 0 && (
        <div className="card px-6 py-10 flex flex-col items-center text-center gap-3">
          <p className="text-base font-semibold text-muted">{t('grading.noStudents')}</p>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {students.map((student) => (
          <div
            key={student.id}
            className="card px-4 py-3 flex flex-col gap-2 cursor-pointer hover:border-accent transition-colors"
            onClick={() => handleStudentClick(student.id)}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ background: 'var(--accent)' }}
              >
                {student.full_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-primary truncate">
                  {student.full_name}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
