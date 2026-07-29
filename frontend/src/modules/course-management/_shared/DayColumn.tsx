import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2'
import LessonBlock from './LessonBlock'
import LessonPicker, { type PickerDay } from './LessonPicker'
import {
  cellDroppableId,
  occupiedCols,
  type ScheduleDay,
  type ScheduleLesson,
} from './schedule-store'

interface Props {
  day: ScheduleDay
  lessonsById: Record<string, ScheduleLesson>
  allLessons: ScheduleLesson[]
  placementsByLesson: Record<string, string[]>
  // All day rows (for the picker's multi-day placement mode).
  allDays: PickerDay[]
  canDelete: boolean
  // Placement instance currently being dragged (null otherwise). Its columns are
  // freed here so they re-appear as droppable EmptyCells — letting the user drop
  // a block back where it started to cancel the move.
  activeId: string | null
  // Usable period columns on THIS day (fewer than gridCols on a half day).
  ncols: number
  // Full-day grid width — keeps period columns aligned across all day rows.
  gridCols: number
  periodMinutes: number
  // Live drop footprint while a block is dragged over THIS day (null otherwise).
  preview: { startCol: number; span: number } | null
  // Placement instance currently highlighted by lesson search (null otherwise).
  highlightId: string | null
  onDeleteDay: (dayId: string) => void
  onRemoveItem: (instanceId: string) => void
  // Single-click a block — open its read-only lesson detail popup.
  onShowLessonDetail: (lessonId: string) => void
  // A block scrolled into view — prefetch lesson detail for this course.
  onLessonVisible: () => void
  // Resize gesture started (pointer-down) — page snapshots for a single undo step.
  onResizeItemStart: () => void
  // Live resize of one placement (preview) — only this block changes.
  onResizeItem: (dayId: string, instanceId: string, startCol: number, span: number) => void
  // Resize committed on release — mirrors the new block size to the lesson's
  // period-per-unit (no confirmation; each block may differ per day).
  onResizeItemEnd: (dayId: string, instanceId: string, startCol: number, span: number) => void
  onSaveDescription: (instanceId: string, description: string) => void
  onSaveRemarks: (instanceId: string, remarks: string) => void
  onAddLessons: (dayId: string, lessonIds: string[], startCol: number) => void
  onAddLessonsMulti: (dayIds: string[], lessonId: string, startCol: number) => void
  onDragMeasure: (size: { w: number; h: number }) => void
}

interface PickerState {
  anchor: DOMRect
  startCol: number
}

function EmptyCell({
  dayId,
  col,
  onClick,
}: {
  dayId: string
  col: number
  onClick: (col: number, rect: DOMRect) => void
}) {
  // Droppable target; drag feedback is shown by the day's span-aware preview
  // overlay, so the cell itself only needs a hover affordance for adding.
  const { setNodeRef } = useDroppable({ id: cellDroppableId(dayId, col) })
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ gridColumn: `${col + 1} / span 1`, gridRow: 1 }}
      onClick={(e) => onClick(col, e.currentTarget.getBoundingClientRect())}
      aria-label={`Add lesson to column ${col + 1}`}
      className="group/cell min-h-[56px] rounded-[8px] flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--surface)]"
    >
      <HiOutlinePlus className="text-[15px] text-muted opacity-0 group-hover/cell:opacity-100 transition-opacity" />
    </button>
  )
}

export default function DayColumn({
  day,
  lessonsById,
  allLessons,
  placementsByLesson,
  allDays,
  canDelete,
  activeId,
  ncols,
  gridCols,
  periodMinutes,
  preview,
  highlightId,
  onDeleteDay,
  onRemoveItem,
  onShowLessonDetail,
  onLessonVisible,
  onResizeItemStart,
  onResizeItem,
  onResizeItemEnd,
  onSaveDescription,
  onSaveRemarks,
  onAddLessons,
  onAddLessonsMulti,
  onDragMeasure,
}: Props) {
  const [picker, setPicker] = useState<PickerState | null>(null)

  const halfDay = ncols < gridCols
  // Exclude the block being dragged so its origin columns become droppable
  // EmptyCells again — the user can drop it back there to cancel the move.
  const cov = occupiedCols(day.items, ncols, activeId ?? undefined)
  const emptyCols: number[] = []
  for (let c = 0; c < ncols; c++) if (!cov[c]) emptyCols.push(c)

  const dayMinutes = ncols * periodMinutes

  // Resize bounds for one block. The left edge stops at the previous neighbour.
  // The right edge may grow all the way to the day's end even over neighbours —
  // enlarging a block in the middle pushes the blocks after it along (the store
  // reflows the schedule on resize), so it isn't capped at the next neighbour.
  const boundsFor = (blockId: string, startCol: number) => {
    const ocov = occupiedCols(day.items, ncols, blockId)
    let leftBound = 0
    for (let c = startCol - 1; c >= 0; c--) {
      if (ocov[c]) { leftBound = c + 1; break }
    }
    return { leftBound, rightBound: ncols }
  }

  const openPicker = (startCol: number, rect: DOMRect) => setPicker({ anchor: rect, startCol })

  return (
    <div className="flex items-stretch gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-2">
      {/* Label + actions column */}
      <div className="w-[124px] shrink-0 flex flex-col justify-center gap-1 px-2 border-r border-[var(--border)]">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-primary">
            {day.dayLabel}
            {halfDay && (
              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-[5px] bg-accent-light text-accent text-[9px] font-bold uppercase tracking-[0.04em] align-middle">
                Half day
              </span>
            )}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDeleteDay(day.id)}
              className="h-6 w-6 inline-flex items-center justify-center rounded-[6px] text-muted cursor-pointer hover:text-[#DC2626] hover:bg-[rgba(220,38,38,0.06)] transition-colors"
              aria-label={`Delete ${day.dayLabel}`}
            >
              <HiOutlineTrash className="text-[13px]" />
            </button>
          )}
        </div>
        <span className="text-[11px] text-muted">
          {day.items.length} {day.items.length === 1 ? 'lesson' : 'lessons'}
        </span>
        <span className="text-[10.5px] text-muted/80">{dayMinutes} min/day</span>
      </div>

      {/* N-cell grid lane (N = periods/day) with dashed vertical separators */}
      <div className="relative flex-1 min-w-0">
        <div
          className="pointer-events-none absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: gridCols }).map((_, i) => (
            <div key={i} className={i < gridCols - 1 ? 'border-r border-dashed border-[var(--border)]' : ''} />
          ))}
        </div>

        <div
          className="relative grid gap-1 min-h-[60px] py-0.5"
          style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
        >
          {halfDay && (
            <div
              style={{
                gridColumn: `${ncols + 1} / span ${gridCols - ncols}`,
                gridRow: 1,
                backgroundImage:
                  'repeating-linear-gradient(135deg, transparent 0 6px, var(--border) 6px 7px)',
              }}
              className="pointer-events-none min-h-[56px] rounded-[8px] flex items-center justify-center"
              aria-hidden
            >
              <span className="text-[10px] font-semibold text-muted bg-[var(--surface-2)] px-1.5 rounded">
                Half day — no periods
              </span>
            </div>
          )}
          {preview && (
            <div
              style={{ gridColumn: `${preview.startCol + 1} / span ${preview.span}`, gridRow: 1 }}
              className="pointer-events-none rounded-[8px] border-2 border-dashed border-[var(--accent)] bg-[var(--accent-light)]"
            />
          )}
          {emptyCols.map((col) => (
            <EmptyCell key={`empty-${col}`} dayId={day.id} col={col} onClick={openPicker} />
          ))}
          {day.items.map((item) => {
            const lesson = lessonsById[item.lessonId]
            if (!lesson) return null
            const { leftBound, rightBound } = boundsFor(item.id, item.startCol)
            return (
              <LessonBlock
                key={item.id}
                placement={item}
                lesson={lesson}
                leftBound={leftBound}
                rightBound={rightBound}
                onShowDetail={() => onShowLessonDetail(item.lessonId)}
                onVisible={onLessonVisible}
                onResizeStart={onResizeItemStart}
                onResize={(startCol, span) => onResizeItem(day.id, item.id, startCol, span)}
                onResizeEnd={(startCol, span) => onResizeItemEnd(day.id, item.id, startCol, span)}
                onRemove={onRemoveItem}
                onSaveDescription={onSaveDescription}
                onSaveRemarks={onSaveRemarks}
                onDragMeasure={onDragMeasure}
                highlighted={item.id === highlightId}
              />
            )
          })}
        </div>
      </div>

      {picker && (
        <LessonPicker
          anchor={picker.anchor}
          lessons={allLessons}
          placementsByLesson={placementsByLesson}
          days={allDays}
          currentDayId={day.id}
          onPick={(lessonId) => {
            onAddLessons(day.id, [lessonId], picker.startCol)
            setPicker(null)
          }}
          onPickMulti={(lessonId, dayIds) => {
            onAddLessonsMulti(dayIds, lessonId, picker.startCol)
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
