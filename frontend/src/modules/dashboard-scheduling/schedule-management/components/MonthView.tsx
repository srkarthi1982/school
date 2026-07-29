import { useEffect, useMemo, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useShallow } from 'zustand/react/shallow'
import useScheduleManagementStore, { selectCourses, selectCursor, selectActiveEntries, selectIsCourseView, selectHighlightEntryId } from '../store'
import { sameDay, buildMonthCells, dayKey, splitEntryIntoSegments } from '../utils/timeUtils'
import ScheduleEntryChip from './ScheduleEntryChip'
import type { Course, ScheduleEntry } from '../types'
import { useI18n } from '../../../../infra/locales/I18nContext'

interface Props {
  canEdit: boolean
}

const MAX_VISIBLE_PER_CELL = 4

interface CellProps {
  date: Date
  cursorDate: Date
  entries: ScheduleEntry[]
  courseById: Map<number, Course>
  canEdit: boolean
  readOnlyCourse: boolean
  highlightEntryId: number | null
  onOpenDay: (date: Date) => void
}

function MonthCell({ date, cursorDate, entries, courseById, canEdit, readOnlyCourse, highlightEntryId, onOpenDay }: CellProps) {
  const { t } = useI18n()
  const dropId = `cell-${dayKey(date)}`
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { dayKey: dayKey(date), type: 'month-cell' },
  })

  const cellEntries = useMemo(() => {
    const targetKey = dayKey(date)
    const matched: ScheduleEntry[] = []
    for (const entry of entries) {
      const segs = splitEntryIntoSegments(entry.startAt, entry.endAt)
      if (segs.some(s => s.dayKey === targetKey)) matched.push(entry)
    }
    return matched.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  }, [entries, date])

  // The searched lesson falls on this day → ring it and bring it into view.
  const isHighlightDay = highlightEntryId != null && cellEntries.some((e) => e.id === highlightEntryId)
  const cellEl = useRef<HTMLDivElement | null>(null)
  const setRefs = (el: HTMLDivElement | null) => {
    setNodeRef(el)
    cellEl.current = el
  }
  useEffect(() => {
    if (isHighlightDay) cellEl.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isHighlightDay])

  const totalCount  = cellEntries.length
  const exceeds     = totalCount > MAX_VISIBLE_PER_CELL
  const visible     = exceeds ? cellEntries.slice(0, MAX_VISIBLE_PER_CELL - 1) : cellEntries
  const hiddenCount = exceeds ? totalCount - visible.length : 0

  const isCurrentMonth = date.getMonth() === cursorDate.getMonth()
  const isToday        = sameDay(date, new Date())

  return (
    <div
      ref={setRefs}
      onClick={() => onOpenDay(date)}
      className={`relative flex flex-col p-1.5 border-e border-b border-[var(--border)] min-h-[110px] cursor-pointer transition-colors ${
        isCurrentMonth ? 'bg-[var(--surface)]' : 'bg-[var(--surface-2)]'
      } ${isOver && canEdit ? 'bg-[var(--accent-light)] outline outline-2 outline-[var(--accent)] outline-dashed' : ''} ${
        isHighlightDay ? 'ring-2 ring-inset ring-[#F59E0B] bg-[#FEF3C7] z-10' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[12px] font-bold tabular-nums w-6 h-6 flex items-center justify-center rounded-full ${
            isToday
              ? 'bg-[var(--accent)] text-white'
              : isCurrentMonth
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          {date.getDate()}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {visible.map(entry => (
          <ScheduleEntryChip
            key={entry.id}
            entry={entry}
            course={readOnlyCourse || entry.course_id == null ? undefined : courseById.get(entry.course_id)}
            canEdit={canEdit}
            onClick={() => onOpenDay(date)}
            dragId={`entry-${entry.id}-${dayKey(date)}`}
            originDayKey={dayKey(date)}
          />
        ))}

        {exceeds && (
          <span className="text-[10px] font-semibold text-[var(--accent)] px-1.5 py-0.5 select-none pointer-events-none">
            +{hiddenCount} {t('common.more')}…
          </span>
        )}
      </div>
    </div>
  )
}

export default function MonthView({ canEdit }: Props) {
  const { t } = useI18n()
  const { entries, courses, cursor, isCourseView, highlightEntryId } = useScheduleManagementStore(
    useShallow(s => ({
      entries: selectActiveEntries(s),
      courses: selectCourses(s),
      cursor: selectCursor(s),
      isCourseView: selectIsCourseView(s),
      highlightEntryId: selectHighlightEntryId(s),
    })),
  )
  // canEdit already reflects the per-course permission (teachers edit, students don't).
  const effectiveCanEdit = canEdit
  const courseById = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses])
  const openDayModal = useScheduleManagementStore(s => s.openDayModal)

  const cursorDate = new Date(cursor)
  const cells = useMemo(() => buildMonthCells(cursorDate), [cursorDate])

  const weekHeaders = useMemo(() => {
    const start = cells[0]
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d.toLocaleDateString(undefined, { weekday: 'short' })
    })
  }, [cells])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--surface)] rounded-[12px] border border-[var(--border)]">
      <div className="flex-1 overflow-y-auto thin-scrollbar-light">
        <div className="grid grid-cols-7 bg-[var(--surface-2)] border-b border-[var(--border)] sticky top-0 z-10">
          {weekHeaders.map((label, i) => (
            <div
              key={i}
              className="px-2 py-2 text-[10.5px] uppercase tracking-wide font-bold text-[var(--text-muted)] text-center border-e border-[var(--border)] last:border-e-0"
            >
              {label}
            </div>
          ))}
        </div>
        <div
          className="grid grid-cols-7"
          style={{ gridAutoRows: 'minmax(110px, auto)' }}
        >
          {cells.map(d => (
            <MonthCell
              key={dayKey(d)}
              date={d}
              cursorDate={cursorDate}
              entries={entries}
              courseById={courseById}
              canEdit={effectiveCanEdit}
              readOnlyCourse={isCourseView}
              highlightEntryId={highlightEntryId}
              onOpenDay={(date) => openDayModal(date.toISOString())}
            />
          ))}
        </div>
      </div>
      <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)] border-t border-[var(--border)] bg-[var(--surface-2)] shrink-0">
        {t('schedule.dragToReschedule')}
      </div>
    </div>
  )
}
