import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineXMark, HiOutlinePlus } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useScheduleManagementStore, {
  selectCourses,
  selectDayModalDate,
  selectDayModalOpen,
  selectActiveEntries,
  selectIsCourseView,
} from '../store'
import { importancePalette } from './ImportanceBadge'
import { addMinutes, dayKey, formatTime, splitEntryIntoSegments } from '../utils/timeUtils'
import type { ScheduleEntry } from '../types'
import { useEntryAction } from '../useEntryAction'

interface Props {
  canEdit: boolean
}

export default function DayEntriesModal({ canEdit }: Props) {
  const { t } = useI18n()
  const { open, dateISO, entries, courses, isCourseView } = useScheduleManagementStore(
    useShallow(s => ({
      open:    selectDayModalOpen(s),
      dateISO: selectDayModalDate(s),
      entries:   selectActiveEntries(s),
      courses: selectCourses(s),
      isCourseView: selectIsCourseView(s),
    })),
  )
  // A course's schedule is read-only: no create, no edit-on-click.
  const effectiveCanEdit = isCourseView ? false : canEdit
  const closeDayModal = useScheduleManagementStore(s => s.closeDayModal)
  const openCreate    = useScheduleManagementStore(s => s.openCreate)
  // Click action: edit (personal) or open lesson detail (course view).
  const onEntry = useEntryAction()

  const courseById = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses])
  const date = useMemo(() => (dateISO ? new Date(dateISO) : null), [dateISO])

  const cellEntries = useMemo<ScheduleEntry[]>(() => {
    if (!date) return []
    const targetKey = dayKey(date)
    const matched: ScheduleEntry[] = []
    for (const entry of entries) {
      const segs = splitEntryIntoSegments(entry.startAt, entry.endAt)
      if (segs.some(s => s.dayKey === targetKey)) matched.push(entry)
    }
    return matched.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  }, [entries, date])

  if (!open || !date) return null

  const headerTitle = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const handleAdd = () => {
    const start = new Date(date)
    start.setHours(9, 0, 0, 0)
    closeDayModal()
    openCreate({
      startAt: start.toISOString(),
      endAt:   addMinutes(start, 60).toISOString(),
    })
  }

  const handleSelect = (entry: ScheduleEntry) => {
    // Course events open the read-only lesson detail; personal entries edit.
    closeDayModal()
    onEntry(entry)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={closeDayModal}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-[var(--surface)] rounded-[14px] shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
        >
          <h2 className="text-white text-[16px] font-bold">{headerTitle}</h2>
          <button
            type="button"
            onClick={closeDayModal}
            className="text-white/70 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[20px]" />
          </button>
        </div>

        <div className="overflow-y-auto thin-scrollbar-light p-4 flex flex-col gap-2 min-h-[120px]">
          {cellEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-1">
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">{t('schedule.noEntries')}</p>
              {effectiveCanEdit && (
                <p className="text-[12px] text-[var(--text-muted)]">{t('schedule.clickToAdd')}</p>
              )}
            </div>
          ) : (
            cellEntries.map(entry => {
              const course  = isCourseView || entry.course_id == null ? undefined : courseById.get(entry.course_id)
              const palette = importancePalette(entry.importance)
              const start   = new Date(entry.startAt)
              const end     = new Date(entry.endAt)
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className="text-start rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--accent-light)] hover:border-[var(--accent)] transition-colors px-3 py-2.5 flex items-start gap-3"
                  style={{ borderInlineStart: `4px solid ${palette.stripe}` }}
                >
                  {!isCourseView && (
                    <span
                      className="text-[10.5px] font-bold rounded-full px-2 py-0.5 shrink-0 mt-0.5 tabular-nums"
                      style={{ background: palette.bg, color: palette.text }}
                    >
                      {entry.importance}
                    </span>
                  )}
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--text-muted)] tabular-nums">
                      <span>{formatTime(start)} – {formatTime(end)}</span>
                    </div>
                    <p className="text-[14px] font-bold text-[var(--text-primary)] truncate">{entry.title}</p>
                    {course && (
                      <p className="text-[11.5px] text-[var(--text-secondary)] truncate">
                        {course.code} — {course.name}
                      </p>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="border-t border-[var(--border)] px-4 py-3 flex items-center justify-end gap-2 bg-[var(--surface-2)]">
          <button
            type="button"
            onClick={closeDayModal}
            className="text-[13px] font-semibold text-[var(--text-secondary)] rounded-[10px] px-4 py-2 hover:bg-[var(--surface)]"
          >
            {t('common.close')}
          </button>
          {effectiveCanEdit && (
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-1.5 bg-[var(--accent)] text-white text-[13px] font-semibold rounded-[10px] px-4 py-2 hover:opacity-90 transition-opacity"
            >
              <HiOutlinePlus className="text-[15px]" />
              {t('schedule.addNew')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
