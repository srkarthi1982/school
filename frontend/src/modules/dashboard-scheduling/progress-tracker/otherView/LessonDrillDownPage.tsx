import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineArrowLeft, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useProgressStore, { type TeacherLessonRecord, type LessonStudentRecord } from '../store'
import { MATERIAL_STATUS_COLORS as STATUS_COLORS, getColorById } from '../utils'

const tk = (k: string) => k as any
const PAGE_SIZE = 10

type FilterStatus = 'all' | 'complete' | 'incomplete'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function TeacherLessonDrillDownPage({ title, description, icon, onBack }: { title: string; description: string; icon: ReactNode; onBack: () => void }) {
  const { t } = useI18n()
  const lessons = useProgressStore(useShallow(s => s.teacherLessons))
  const lessonStudents = useProgressStore(useShallow(s => s.teacherLessonStudents))
  const drilldownLoading = useProgressStore(useShallow(s => s.drilldownLoading?.lessons))
  const studentsLoading = useProgressStore(useShallow(s => s.drilldownLoading?.lessonStudents))
  const [status, setStatus] = useState<FilterStatus>('all')
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [selectedLesson, setSelectedLesson] = useState<TeacherLessonRecord | null>(null)
  const [detailStatus, setDetailStatus] = useState<FilterStatus>('all')

  // Fetch all lessons across the teacher's courses. Course/status filtering is done
  // client-side so the stat counts stay accurate regardless of the selected filter.
  useEffect(() => {
    useProgressStore.getState().fetchTeacherDrilldown('lessons')
  }, [])

  useEffect(() => {
    setPage(1)
  }, [status, selectedCourseId, lessons])

  // A teacher can teach several courses — offer a course filter.
  const uniqueCourses = useMemo(() => {
    const seen = new Map<number, string>()
    for (const l of lessons) {
      if (!seen.has(l.courseId)) seen.set(l.courseId, l.courseName)
    }
    return Array.from(seen, ([courseId, courseName]) => ({ courseId, courseName }))
  }, [lessons])

  const courseFiltered = useMemo(
    () => (selectedCourseId ? lessons.filter(l => l.courseId === selectedCourseId) : lessons),
    [lessons, selectedCourseId],
  )

  const statCounts = useMemo(() => ({
    courses: new Set(courseFiltered.map(l => l.courseId)).size,
    total: courseFiltered.length,
    completed: courseFiltered.filter(l => l.completed).length,
    incomplete: courseFiltered.filter(l => !l.completed).length,
  }), [courseFiltered])

  const visibleLessons = useMemo(() => {
    if (status === 'complete') return courseFiltered.filter(l => l.completed)
    if (status === 'incomplete') return courseFiltered.filter(l => !l.completed)
    return courseFiltered
  }, [courseFiltered, status])

  const totalPages = Math.max(1, Math.ceil(visibleLessons.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedLessons = useMemo(
    () => visibleLessons.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visibleLessons, currentPage],
  )
  const rangeStart = visibleLessons.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, visibleLessons.length)

  // Open the per-lesson student breakdown for the clicked lesson.
  function openLesson(l: TeacherLessonRecord) {
    setSelectedLesson(l)
    setDetailStatus('all')
    useProgressStore.getState().fetchTeacherLessonStudents(l.courseId, l.lessonId)
  }

  const studentStatCounts = useMemo(() => ({
    total: lessonStudents.length,
    completed: lessonStudents.filter(s => s.completed).length,
    incomplete: lessonStudents.filter(s => !s.completed).length,
  }), [lessonStudents])

  const visibleStudents = useMemo(() => {
    if (detailStatus === 'complete') return lessonStudents.filter(s => s.completed)
    if (detailStatus === 'incomplete') return lessonStudents.filter(s => !s.completed)
    return lessonStudents
  }, [lessonStudents, detailStatus])

  // ---- Per-lesson student detail view ----
  if (selectedLesson) {
    return (
      <div className="ps-8 pt-1 pb-10">
        <button onClick={() => setSelectedLesson(null)} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary mb-4 transition-colors">
          <HiOutlineArrowLeft className="text-[14px]" />
          {t(tk('progress.lessonBackToList'))}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-[8px] flex items-center justify-center text-[16px] font-bold text-white shrink-0" style={{ background: getColorById(selectedLesson.courseId) }}>
            {(selectedLesson.lessonNumber || selectedLesson.lessonTitle || '?').charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">
              {selectedLesson.lessonNumber ? `${selectedLesson.lessonNumber}. ` : ''}{selectedLesson.lessonTitle}
            </h2>
            <p className="text-[12px] text-muted">{selectedLesson.courseName}</p>
          </div>
        </div>

        {/* Status filter */}
        <div className="mb-4">
          <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.status'))}</p>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'all' as FilterStatus, label: tk('progress.lessonAll'), color: 'var(--accent)' },
              { key: 'complete' as FilterStatus, label: tk('progress.complete'), color: STATUS_COLORS.completed.text },
              { key: 'incomplete' as FilterStatus, label: tk('progress.incomplete'), color: STATUS_COLORS['not-started'].text },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setDetailStatus(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${f.key === detailStatus ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />
                {t(f.label as any)}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="card px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
              <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.totalStudents'))}</p>
            </div>
            <p className="text-xl font-bold text-accent">{studentStatCounts.total}</p>
          </div>
          <div className="card px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS.completed.text }} />
              <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.completedLessons'))}</p>
            </div>
            <p className="text-xl font-bold" style={{ color: STATUS_COLORS.completed.text }}>{studentStatCounts.completed}</p>
          </div>
          <div className="card px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS['not-started'].text }} />
              <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.incompleteLessons'))}</p>
            </div>
            <p className="text-xl font-bold" style={{ color: STATUS_COLORS['not-started'].text }}>{studentStatCounts.incomplete}</p>
          </div>
        </div>

        {/* Students grid */}
        {studentsLoading ? (
          <div className="card p-8 text-center"><p className="text-muted text-[13px]">Loading...</p></div>
        ) : visibleStudents.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-muted text-[13px]">{t(tk('progress.noStudentsFound'))}</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-bd">
                    <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('progress.teacherStudentName'))}</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('common.status'))}</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('progress.completedBy'))}</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('progress.completedOn'))}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bd">
                  {visibleStudents.map((s: LessonStudentRecord) => {
                    const sc = s.completed ? STATUS_COLORS.completed : STATUS_COLORS['not-started']
                    return (
                      <tr key={s.studentId} className="hover:bg-surface-2/40 transition-colors">
                        <td className="px-5 py-3">
                          <span className="text-[12.5px] font-medium text-primary">{s.studentName}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: sc.bg, color: sc.text }}>
                            {s.completed ? t(tk('progress.complete')) : t(tk('progress.incomplete'))}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-[12px] text-muted">{s.completedBy || '—'}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-[12px] text-muted">{formatDate(s.completedAt)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (drilldownLoading) {
    return (
      <div className="ps-8 pt-1 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary transition-colors">
            <HiOutlineArrowLeft className="text-[14px]" />
            {t(tk('progress.backToOverview'))}
          </button>
        </div>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted text-[13px]">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ps-8 pt-1 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary transition-colors">
          <HiOutlineArrowLeft className="text-[14px]" />
          {t(tk('progress.backToOverview'))}
        </button>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] bg-accent-light text-accent shrink-0">{icon}</div>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.02em]">{title}</h1>
      </div>
      <p className="text-[13px] text-muted ml-12 mb-6">{description}</p>

      {/* Course filter */}
      <div className="mb-4">
        <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.course'))}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCourseId(null)}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${!selectedCourseId ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
          >
            {t(tk('progress.lessonAll'))}
          </button>
          {uniqueCourses.map(c => (
            <button
              key={c.courseId}
              onClick={() => setSelectedCourseId(c.courseId)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${selectedCourseId === c.courseId ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getColorById(c.courseId) }} />
              {c.courseName}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter */}
      <div className="mb-4">
        <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.status'))}</p>
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'all' as FilterStatus, label: tk('progress.lessonAll'), color: 'var(--accent)' },
            { key: 'complete' as FilterStatus, label: tk('progress.complete'), color: STATUS_COLORS.completed.text },
            { key: 'incomplete' as FilterStatus, label: tk('progress.incomplete'), color: STATUS_COLORS['not-started'].text },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${f.key === status ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: f.color }} />
              {t(f.label as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: getColorById(1) }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.totalCourses'))}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: getColorById(1) }}>{statCounts.courses}</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.totalLessons'))}</p>
          </div>
          <p className="text-xl font-bold text-accent">{statCounts.total}</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS.completed.text }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.completedLessons'))}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: STATUS_COLORS.completed.text }}>{statCounts.completed}</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS['not-started'].text }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.incompleteLessons'))}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: STATUS_COLORS['not-started'].text }}>{statCounts.incomplete}</p>
        </div>
      </div>

      {/* Lessons grid */}
      {visibleLessons.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-muted text-[13px]">{t(tk('progress.noLessonsFound'))}</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-bd">
                  <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('common.course'))}</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('progress.lesson'))}</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('common.status'))}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bd">
                {pagedLessons.map((l: TeacherLessonRecord) => {
                  const sc = l.completed ? STATUS_COLORS.completed : STATUS_COLORS['not-started']
                  return (
                    <tr key={`${l.courseId}-${l.lessonId}`} onClick={() => openLesson(l)} className="hover:bg-surface-2/40 transition-colors cursor-pointer">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getColorById(l.courseId) }} />
                          <span className="text-[12px] text-primary">{l.courseName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[12.5px] font-medium text-primary">
                          {l.lessonNumber ? `${l.lessonNumber}. ` : ''}{l.lessonTitle}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: sc.bg, color: sc.text }}>
                          {l.completed ? t(tk('progress.complete')) : t(tk('progress.incomplete'))}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-bd">
            <p className="text-[11px] text-muted">
              {rangeStart}–{rangeEnd} {t(tk('common.of'))} {visibleLessons.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors text-muted enabled:hover:border-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <HiOutlineChevronLeft className="text-[13px]" />
                {t(tk('common.prev'))}
              </button>
              <span className="text-[11px] font-medium text-muted">
                {t(tk('common.page'))} {currentPage} {t(tk('common.of'))} {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors text-muted enabled:hover:border-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t(tk('common.next'))}
                <HiOutlineChevronRight className="text-[13px]" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
