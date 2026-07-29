import { useMemo, useState, useEffect, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineArrowLeft, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useProgressStore, { type LessonRecord } from '../store'
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

export default function StudentLessonDrillDownPage({ title, description, icon, onBack }: { title: string; description: string; icon: ReactNode; onBack: () => void }) {
  const { t } = useI18n()
  const lessons = useProgressStore(useShallow(s => s.lessons))
  const drilldownLoading = useProgressStore(useShallow(s => s.drilldownLoading?.lessons))
  const [status, setStatus] = useState<FilterStatus>('all')
  const [page, setPage] = useState(1)

  // Fetch all lessons for the student (status filtering is done client-side so the
  // stat counts stay accurate regardless of the selected filter).
  useEffect(() => {
    useProgressStore.getState().fetchStudentDrilldown('lessons')
  }, [])

  // Reset to the first page whenever the filter or the data set changes.
  useEffect(() => {
    setPage(1)
  }, [status, lessons])

  const statCounts = useMemo(() => ({
    total: lessons.length,
    completed: lessons.filter(l => l.completed).length,
    incomplete: lessons.filter(l => !l.completed).length,
  }), [lessons])

  const visibleLessons = useMemo(() => {
    if (status === 'complete') return lessons.filter(l => l.completed)
    if (status === 'incomplete') return lessons.filter(l => !l.completed)
    return lessons
  }, [lessons, status])

  const totalPages = Math.max(1, Math.ceil(visibleLessons.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedLessons = useMemo(
    () => visibleLessons.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visibleLessons, currentPage],
  )
  const rangeStart = visibleLessons.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, visibleLessons.length)

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
      <div className="grid grid-cols-3 gap-3 mb-4">
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
                  <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('progress.completedBy'))}</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">{t(tk('progress.completedOn'))}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bd">
                {pagedLessons.map((l: LessonRecord) => {
                  const sc = l.completed ? STATUS_COLORS.completed : STATUS_COLORS['not-started']
                  return (
                    <tr key={`${l.courseId}-${l.lessonId}`} className="hover:bg-surface-2/40 transition-colors">
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
                      <td className="px-5 py-3">
                        <span className="text-[12px] text-muted">{l.completedBy || '—'}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[12px] text-muted">{formatDate(l.completedAt)}</span>
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
