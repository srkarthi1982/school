import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useShallow } from 'zustand/react/shallow'
import useScheduleManagementStore, { selectCourses, selectCursor, selectActiveEntries, selectIsCourseView, selectHighlightEntryId, selectFocusNonce } from '../store'
import { dayKey, addMinutes, formatTime, splitEntryIntoSegments } from '../utils/timeUtils'
import { PIXELS_PER_HOUR } from '../utils/dragHelpers'
import { computeDayLayout, type ScheduleEntryOnDay } from '../utils/overlapLayout'
import ScheduleEntryBlock from './ScheduleEntryBlock'
import { useEntryAction } from '../useEntryAction'
import TimeColumn from './TimeColumn'
import ScheduleEntryOverflowPopover from './ScheduleEntryOverflowPopover'
import type { ScheduleEntry } from '../types'
import { useI18n } from '../../../../infra/locales/I18nContext'

interface Props {
  canEdit: boolean
  fromHour?: number
  toHour?: number
}

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

export default function DayView({ canEdit, fromHour, toHour }: Props) {
  const { t } = useI18n()
  const FROM_HOUR = fromHour ?? 0
  const TO_HOUR = toHour ?? 24
  const BASE_MINUTES = FROM_HOUR * 60
  const TOTAL_HEIGHT = (TO_HOUR - FROM_HOUR) * PIXELS_PER_HOUR
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
  // canEdit already reflects the per-course permission (teachers can edit a course
  // they instruct; students get false from the page).
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

  const date = new Date(cursor)
  const dKey = dayKey(date)
  const dropId = `day-${dKey}`
  const { setNodeRef, isOver } = useDroppable({ id: dropId, data: { dayKey: dKey, type: 'day-column' } })

  const segments = useMemo(() => segmentsForDay(entries, date), [entries, date])
  const layout = useMemo(() => computeDayLayout(segments), [segments])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [popoverFor, setPopoverFor] = useState<{ entries: ScheduleEntry[]; top: number } | null>(null)

  // On open, scroll the grid so the current time sits near the top.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = new Date()
    const minutesSinceStart = (now.getHours() * 60 + now.getMinutes()) - FROM_HOUR * 60
    el.scrollTop = Math.max(0, minutesSinceStart * (PIXELS_PER_HOUR / 60) - PIXELS_PER_HOUR / 2)
  }, [])

  // When a lesson is picked in the search, scroll to its start hour (cursor has
  // already jumped to its day). Keyed on focusNonce so re-picking re-scrolls.
  useEffect(() => {
    if (highlightEntryId == null) return
    const el = scrollRef.current
    if (!el) return
    const match = entries.find((e) => e.id === highlightEntryId)
    if (!match) return
    const start = new Date(match.startAt)
    if (dayKey(start) !== dKey) return // not on the shown day
    const minutes = start.getHours() * 60 + start.getMinutes()
    el.scrollTo({ top: Math.max(0, minutes * (PIXELS_PER_HOUR / 60) - PIXELS_PER_HOUR / 2), behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce])

  const handleColumnClick = (e: React.MouseEvent) => {
    if (!effectiveCanEdit) return
    if ((e.target as HTMLElement).closest('[data-entry-block]')) return
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutesFromMidnight = (y / PIXELS_PER_HOUR) * 60
    const snapped = Math.round(minutesFromMidnight / 15) * 15
    const minutesWithBase = snapped + BASE_MINUTES
    const startAt = new Date(date)
    startAt.setHours(0, 0, 0, 0)
    const start = addMinutes(startAt, minutesWithBase)
    requestCreate(start.toISOString())
  }

  return (
    <div className="flex h-full overflow-hidden bg-[var(--surface)] rounded-[12px] border border-[var(--border)]">
      <div ref={scrollRef} className="overflow-y-auto thin-scrollbar-light flex-1 flex">
        <TimeColumn fromHour={FROM_HOUR} toHour={TO_HOUR} />

        <div
          ref={(node) => {
            setNodeRef(node)
            containerRef.current = node
          }}
          onClick={handleColumnClick}
          className="relative flex-1 min-w-0"
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

          {isOver && effectiveCanEdit && (
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
                  course={isCourseView || item.entry.course_id == null ? undefined : courseById.get(item.entry.course_id)}
                  segmentStartMs={item.segmentStartMs}
                  segmentEndMs={item.segmentEndMs}
                  isHead={item.isHead}
                  isTail={item.isTail}
                  leftPct={(item.col / item.count) * 100}
                  widthPct={100 / item.count}
                  canEdit={effectiveCanEdit}
                  readOnlyCourse={isCourseView}
                  baseMinutes={BASE_MINUTES}
                  highlighted={item.entry.id === highlightEntryId}
                  onClick={() => onEntry(item.entry)}
                  dragId={`entry-${item.entry.id}-${dKey}`}
                  segmentDayKey={dKey}
                  siblings={segments
                    .filter(s => s.entry.id !== item.entry.id)
                    .map(s => s.entry)}
                  onResize={handleResize}
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
                  top: (startMin - BASE_MINUTES) * (PIXELS_PER_HOUR / 60),
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
                  className="absolute inset-0.5 rounded-[8px] bg-[var(--accent-light)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] text-[11px] font-bold px-2 transition-colors flex items-center justify-center"
                >
                  +{cluster.hidden.length} {t('common.more')}
                </button>
              </div>
            )
          })}

          {popoverFor && (
            <div className="absolute" style={{ top: popoverFor.top + 24, right: 8, zIndex: 50 }}>
              <ScheduleEntryOverflowPopover
                entries={popoverFor.entries}
                courseById={courseById}
                onPick={(id) => {
                  setPopoverFor(null)
                  const e = popoverFor.entries.find((x) => x.id === id)
                  if (e) onEntry(e)
                }}
                onClose={() => setPopoverFor(null)}
              />
            </div>
          )}

          {segments.length === 0 && (
            <div className="absolute inset-x-0 top-1/3 flex flex-col items-center text-[var(--text-muted)] text-[12px] pointer-events-none">
              <span>{t('schedule.noEntries')}</span>
              <span className="text-[10.5px] mt-0.5 opacity-70">
                {effectiveCanEdit ? `${formatTime(date)} • ${t('schedule.clickToAdd')}` : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
