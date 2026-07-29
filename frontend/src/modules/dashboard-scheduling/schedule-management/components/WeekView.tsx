import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useShallow } from 'zustand/react/shallow'
import useScheduleManagementStore, { selectCourses, selectCursor, selectActiveEntries, selectIsCourseView, selectHighlightEntryId, selectFocusNonce } from '../store'
import { sameDay, startOfWeek, addDays, addMinutes, dayKey, splitEntryIntoSegments } from '../utils/timeUtils'
import { PIXELS_PER_HOUR } from '../utils/dragHelpers'
import { computeDayLayout, type ScheduleEntryOnDay } from '../utils/overlapLayout'
import ScheduleEntryBlock from './ScheduleEntryBlock'
import { useEntryAction } from '../useEntryAction'
import TimeColumn from './TimeColumn'
import ScheduleEntryOverflowPopover from './ScheduleEntryOverflowPopover'
import type { Course, ScheduleEntry } from '../types'

interface Props {
  canEdit: boolean
}

const FROM_HOUR = 0
const TO_HOUR = 24
const TOTAL_HEIGHT = (TO_HOUR - FROM_HOUR) * PIXELS_PER_HOUR

function segmentsForDay(entries: ScheduleEntry[], date: Date): ScheduleEntryOnDay[] {
  const targetKey = dayKey(date)
  const out: ScheduleEntryOnDay[] = []
  for (const entry of entries) {
    for (const seg of splitEntryIntoSegments(entry.startAt, entry.endAt)) {
      if (seg.dayKey !== targetKey) continue
      out.push({
        entry,
        segmentStartMs: seg.startAtMs,
        segmentEndMs: seg.endAtMs,
        isHead: seg.isHead,
        isTail: seg.isTail,
      })
    }
  }
  return out
}

interface DayColumnProps {
  date: Date
  canEdit: boolean
  entries: ScheduleEntry[]
  courseById: Map<number, Course>
  readOnlyCourse: boolean
  highlightEntryId: number | null
  onCreateAt: (start: Date) => void
  onOpenEntry: (entry: ScheduleEntry) => void
  onResize: (id: number, startISO: string, endISO: string) => void
}

function DayColumn({ date, canEdit, entries, courseById, readOnlyCourse, highlightEntryId, onCreateAt, onOpenEntry, onResize }: DayColumnProps) {
  const dKey = dayKey(date)
  const dropId = `day-${dKey}`
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { dayKey: dKey, type: 'day-column' },
  })
  const containerRef = useRef<HTMLDivElement | null>(null)

  const segments = useMemo(() => segmentsForDay(entries, date), [entries, date])
  const layout   = useMemo(() => computeDayLayout(segments), [segments])
  const [popoverFor, setPopoverFor] = useState<{ entries: ScheduleEntry[]; top: number } | null>(null)

  const handleClick = (e: React.MouseEvent) => {
    if (!canEdit) return
    if ((e.target as HTMLElement).closest('[data-entry-block]')) return
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutes = (y / PIXELS_PER_HOUR) * 60
    const snapped = Math.round(minutes / 15) * 15
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    onCreateAt(addMinutes(start, snapped))
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        containerRef.current = node
      }}
      onClick={handleClick}
      className="relative flex-1 min-w-0 border-e border-[var(--border)] last:border-e-0"
      style={{ height: TOTAL_HEIGHT }}
    >
      {Array.from({ length: TO_HOUR - FROM_HOUR }).map((_, i) => (
        <div
          key={i}
          className="absolute inset-x-0 border-t border-dashed border-[var(--border)]"
          style={{ top: i * PIXELS_PER_HOUR }}
        />
      ))}
      {Array.from({ length: TO_HOUR - FROM_HOUR }).map((_, i) => (
        <div
          key={`half-${i}`}
          className="absolute inset-x-0 border-t border-dotted border-[var(--border)] opacity-50"
          style={{ top: i * PIXELS_PER_HOUR + PIXELS_PER_HOUR / 2 }}
        />
      ))}

      {isOver && canEdit && (
        <div
          className="absolute inset-0 pointer-events-none rounded-[6px]"
          style={{ background: 'var(--accent-light)' }}
        />
      )}

      {layout.visible.map(item => (
        <div data-entry-block key={`${item.entry.id}-${dKey}`} className="absolute inset-0 pointer-events-none">
          <div className="pointer-events-auto h-full">
            <ScheduleEntryBlock
              entry={item.entry}
              course={readOnlyCourse || item.entry.course_id == null ? undefined : courseById.get(item.entry.course_id)}
              segmentStartMs={item.segmentStartMs}
              segmentEndMs={item.segmentEndMs}
              isHead={item.isHead}
              isTail={item.isTail}
              leftPct={(item.col / item.count) * 100}
              widthPct={100 / item.count}
              canEdit={canEdit}
              readOnlyCourse={readOnlyCourse}
              highlighted={item.entry.id === highlightEntryId}
              onClick={() => onOpenEntry(item.entry)}
              dragId={`entry-${item.entry.id}-${dKey}`}
              segmentDayKey={dKey}
              siblings={segments
                .filter(s => s.entry.id !== item.entry.id)
                .map(s => s.entry)}
              onResize={onResize}
            />
          </div>
        </div>
      ))}

      {layout.overflow.map(cluster => {
        const minDate = new Date(cluster.startMs)
        const startMin = minDate.getHours() * 60 + minDate.getMinutes()
        const durationMin = (cluster.endMs - cluster.startMs) / 60000
        return (
          <div
            key={`ov-${cluster.clusterId}`}
            className="absolute z-10"
            style={{
              top: startMin * (PIXELS_PER_HOUR / 60),
              height: durationMin * (PIXELS_PER_HOUR / 60),
              left: '66.66%',
              width: '33.33%',
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPopoverFor({
                  entries: cluster.hidden.map(h => h.entry),
                  top: startMin * (PIXELS_PER_HOUR / 60),
                })
              }}
              className="absolute inset-0.5 rounded-[6px] bg-[var(--accent-light)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] text-[10px] font-bold transition-colors flex items-center justify-center"
            >
              +{cluster.hidden.length}
            </button>
          </div>
        )
      })}

      {popoverFor && (
        <div className="absolute" style={{ top: popoverFor.top + 20, left: 8, zIndex: 50 }}>
          <ScheduleEntryOverflowPopover
            entries={popoverFor.entries}
            courseById={courseById}
            onPick={(id) => {
              setPopoverFor(null)
              const e = popoverFor.entries.find((x) => x.id === id)
              if (e) onOpenEntry(e)
            }}
            onClose={() => setPopoverFor(null)}
          />
        </div>
      )}
    </div>
  )
}

export default function WeekView({ canEdit }: Props) {
  const { entries, courses, cursor, isCourseView, highlightEntryId, focusNonce } = useScheduleManagementStore(
    useShallow(s => ({
      entries: selectActiveEntries(s),
      courses: selectCourses(s),
      cursor: selectCursor(s),
      isCourseView: selectIsCourseView(s),
      highlightEntryId: selectHighlightEntryId(s),
      focusNonce: selectFocusNonce(s),
    })),
  )
  // canEdit already reflects the per-course permission (teachers edit, students don't).
  const effectiveCanEdit = canEdit
  const courseById = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses])
  const requestCreate = useScheduleManagementStore(s => s.requestCreate)
  const moveEntry   = useScheduleManagementStore(s => s.moveEntry)
  const moveCoursePlacement = useScheduleManagementStore(s => s.moveCoursePlacement)
  // Resize persists to the placement (course) or the personal entry.
  const handleResize = (id: number, startISO: string, endISO: string) => {
    if (isCourseView) {
      const en = entries.find(x => x.id === id)
      if (en?.placementId != null) moveCoursePlacement(en, startISO, endISO)
    } else {
      moveEntry(id, startISO, endISO)
    }
  }
  // Click action: edit (personal) or open lesson detail (course view).
  const onEntry = useEntryAction()

  const cursorDate = new Date(cursor)
  const weekStart = startOfWeek(cursorDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // On open, scroll the grid so the current time sits near the top.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    el.scrollTop = Math.max(0, minutes * (PIXELS_PER_HOUR / 60) - PIXELS_PER_HOUR / 2)
  }, [])

  // When a lesson is picked in the search, scroll to its start hour (cursor has
  // already jumped to its week). Keyed on focusNonce so re-picking re-scrolls.
  useEffect(() => {
    if (highlightEntryId == null) return
    const el = scrollRef.current
    if (!el) return
    const match = entries.find((e) => e.id === highlightEntryId)
    if (!match) return
    const start = new Date(match.startAt)
    const minutes = start.getHours() * 60 + start.getMinutes()
    el.scrollTo({ top: Math.max(0, minutes * (PIXELS_PER_HOUR / 60) - PIXELS_PER_HOUR / 2), behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--surface)] rounded-[12px] border border-[var(--border)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scrollbar-light overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="flex border-b border-[var(--border)] bg-[var(--surface-2)] sticky top-0 z-20">
            <div className="w-14 shrink-0 border-e border-[var(--border)]" />
            {days.map(d => {
              const isToday = sameDay(d, new Date())
              return (
                <div
                  key={dayKey(d)}
                  className={`flex-1 px-2 py-2 text-center border-e border-[var(--border)] last:border-e-0 ${
                    isToday ? 'bg-[var(--accent-light)]' : ''
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--text-muted)]">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </div>
                  <div className={`text-[15px] font-bold tabular-nums ${isToday ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                    {d.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex">
            <TimeColumn fromHour={FROM_HOUR} toHour={TO_HOUR} />
            {days.map(d => (
              <DayColumn
                key={dayKey(d)}
                date={d}
                canEdit={effectiveCanEdit}
                entries={entries}
                courseById={courseById}
                readOnlyCourse={isCourseView}
                highlightEntryId={highlightEntryId}
                onCreateAt={(start) => requestCreate(start.toISOString())}
                onOpenEntry={onEntry}
                onResize={handleResize}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
