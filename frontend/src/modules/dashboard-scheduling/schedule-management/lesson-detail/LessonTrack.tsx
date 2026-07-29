import { useCallback, useMemo, useState } from 'react'
import { HiOutlineUserGroup, HiOutlineCheckCircle, HiOutlineArrowPath, HiOutlineMagnifyingGlass, HiOutlineFunnel } from 'react-icons/hi2'
import type { ValidTranslationKeys } from '../../../../infra/locales/I18nContext'
import { useI18n } from '../../../../infra/locales/I18nContext'
import type { LessonTrackStudent } from './api'
import { toggleLessonTrack } from './api'
import useToastStore from '../../../../infra/shared/store/useToastStore'
import { extractErrorMessage } from '../../../../infra/shared/utils/apiError'

const tk = (k: string) => k as ValidTranslationKeys

function Card({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon?: React.ReactNode
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        {icon && <span className="text-[var(--accent)] text-[16px]">{icon}</span>}
        <h2 className="text-[12.5px] font-bold text-[var(--text-primary)] uppercase tracking-[0.03em]">{title}</h2>
        {count != null && (
          <span className="ms-auto text-[11px] font-bold text-[var(--accent)] bg-[var(--accent-light)] rounded-full px-2 py-0.5 tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-2">{children}</div>
    </section>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] text-[var(--text-muted)] italic">{children}</p>
}

// Custom checkbox — styled to match app theme, no native input.
function Checkbox({ checked, onChange, title, loading }: { checked: boolean; onChange: () => void; title?: string; loading?: boolean }) {
  if (loading) {
    return (
      <span className="shrink-0 inline-flex items-center justify-center w-[20px] h-[20px] rounded-md border border-[var(--border)]">
        <HiOutlineArrowPath className="text-[14px] text-[var(--accent)] animate-spin" />
      </span>
    )
  }
      return (
        <button
          type="button"
          onClick={onChange}
          title={title}
          className={`shrink-0 inline-flex items-center justify-center w-[20px] h-[20px] rounded-md border border-[var(--border)] transition-colors cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] ${
            checked
              ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
              : 'bg-[var(--surface-2)] text-[var(--text-muted)]'
          }`}
          aria-checked={checked}
          role="checkbox"
        >
          {checked && <HiOutlineCheckCircle className="text-[13px]" />}
        </button>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function LessonTrackCard({
  courseInstanceId,
  lessonId,
  canManage,
  enrolledStudents,
  onToggleSuccess,
}: {
  courseInstanceId: number
  lessonId: number
  canManage: boolean
  enrolledStudents: LessonTrackStudent[]
  onToggleSuccess: () => void
}) {
  const { t } = useI18n()
  const [loadingStudent, setLoadingStudent] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'completed' | 'notCompleted' | 'all'>('completed')
  const completedCount = enrolledStudents.filter((s) => s.completed).length

  const filteredStudents = useMemo(() => {
    const searchLower = search.toLowerCase()
    return enrolledStudents.filter((s) => {
      const matchesSearch = searchLower === '' || s.fullName.toLowerCase().includes(searchLower)
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'completed' && s.completed) || (statusFilter === 'notCompleted' && !s.completed)
      return matchesSearch && matchesStatus
    })
  }, [enrolledStudents, search, statusFilter])

  const filterOptions: { key: 'completed' | 'notCompleted'; label: () => string }[] = [
    { key: 'completed', label: () => t('dashboard.lessonTrack.filterCompleted') },
    { key: 'notCompleted', label: () => t('dashboard.lessonTrack.filterNotCompleted') },
  ]

  const onToggle = useCallback(
    async (studentId: number, completed: boolean) => {
      setLoadingStudent(studentId)
      try {
        await toggleLessonTrack(courseInstanceId, lessonId, studentId, completed)
        onToggleSuccess()
      } catch (err) {
        console.error('Failed to toggle lesson track:', err)
        useToastStore.getState().push({
          variant: 'error',
          title: extractErrorMessage(err),
        })
      } finally {
        setLoadingStudent(null)
      }
    },
    [courseInstanceId, lessonId, onToggleSuccess],
  )

  return (
    <Card title={t('dashboard.lessonTrack.title')} icon={<HiOutlineUserGroup />} count={canManage ? enrolledStudents.length : undefined}>
        {enrolledStudents.length === 0 ? (
        <EmptyHint>{t('dashboard.lessonTrack.noStudents')}</EmptyHint>
      ) : canManage ? (
          <>
            {/* Search + filter bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <HiOutlineMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)] pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('dashboard.lessonTrack.searchPlaceholder')}
                  className="w-full h-8 pl-8 pr-3 rounded-[8px] bg-[var(--surface-2)] text-[var(--text-primary)] text-[12px] outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-muted)] placeholder:text-[12px]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <span className="text-[11px]">&times;</span>
                  </button>
                )}
              </div>
              <div className="inline-flex items-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)]">
                <HiOutlineFunnel className="text-[12px] text-[var(--text-muted)] ml-2 mr-1 pointer-events-none" />
                <div className="inline-flex items-center p-0.5">
                  {filterOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStatusFilter(statusFilter === opt.key ? 'all' : opt.key)}
                      className={`px-2 py-1.5 text-[11px] font-semibold rounded-[6px] transition-colors cursor-pointer ${
                        statusFilter === opt.key
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface)]'
                      }`}
                    >
                      {opt.label()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              {filteredStudents.length === 0 ? (
                <EmptyHint>{t('dashboard.lessonTrack.noMatch')}</EmptyHint>
              ) : filteredStudents.map((s) => (
                  <div
                    key={s.studentId}
                    className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5"
                  >
                    <Checkbox
                      checked={s.completed}
                      loading={loadingStudent === s.studentId}
                      title={s.completed ? t('dashboard.lessonTrack.uncompleteTooltip') : t('dashboard.lessonTrack.completeTooltip')}
                      onChange={() => {
                        onToggle(s.studentId, !s.completed)
                      }}
                    />
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                        {s.fullName}
                      </span>
                    </div>
                    {!s.completed && (
                      <span className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">{t('dashboard.lessonTrack.notYetComplete')}</span>
                    )}
                    {s.completed && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]">
                        <HiOutlineCheckCircle className="text-[13px]" /> {formatDate(s.completedAt!)}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </>
      ) : (
          // Student view: interactive row for own completion
          <>
            {(() => {
              const me = enrolledStudents.find((s) => s.completedByMe)
              return (
                <>
                  {/* Personal status row */}
                  <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5">
                    <span className={`shrink-0 inline-flex items-center justify-center w-[20px] h-[20px] ${
                      me?.completed
                        ? 'text-[var(--accent)]'
                        : ''
                    }`}>
                      {me?.completed ? (
                        <HiOutlineCheckCircle className="text-[13px]" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--text-muted)]" />
                      )}
                    </span>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      {me && me.completed ? (
                        <span className="text-[11px]">
                          Completed on {formatDate(me.completedAt!)} · by {me.completedBy}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">{t('dashboard.lessonTrack.notYetComplete')}</span>
                      )}
                    </div>
                  </div>
                </>
              )
            })()}
          </>
      )}
    </Card>
  )
}
