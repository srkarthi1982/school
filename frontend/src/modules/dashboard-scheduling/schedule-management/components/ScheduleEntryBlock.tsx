import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { HiOutlineTrash } from 'react-icons/hi2'
import type { Course, ScheduleEntry } from '../types'
import { importancePalette } from './ImportanceBadge'
import { formatTime } from '../utils/timeUtils'
import { PIXELS_PER_MINUTE, pixelsToMinutes, snapMinutes } from '../utils/dragHelpers'
import { clampResize, type ResizeEdge } from '../utils/overlapLayout'
import useScheduleManagementStore, { selectSavingEntryId } from '../store'
import { confirmDialog } from '../../../../infra/shared/store/useConfirmStore'

interface Props {
  entry: ScheduleEntry
  course?: Course
  segmentStartMs: number
  segmentEndMs: number
  isHead: boolean
  isTail: boolean
  leftPct: number
  widthPct: number
  canEdit: boolean
  onClick: () => void
  dragId: string
  segmentDayKey: string
  siblings?: ScheduleEntry[]
  onResize?: (entryId: number, startISO: string, endISO: string) => void
  // Read-only course-schedule block: uses a course palette and hides the
  // (irrelevant) importance badge. Drag/resize are already off via canEdit=false.
  readOnlyCourse?: boolean
  baseMinutes?: number
  // The current lesson-search match — drawn with a distinct accent glow so the
  // user notices it after jumping to it.
  highlighted?: boolean
}

// Palette for read-only course-schedule blocks (course events carry no importance).
const COURSE_PALETTE = {
  bg: 'var(--accent-light)',
  stripe: 'var(--accent)',
  text: 'var(--text-primary)',
}

interface ResizeState {
  edge: ResizeEdge
  topMin: number
  durationMin: number
}

export default function ScheduleEntryBlock({
  entry,
  course,
  segmentStartMs,
  segmentEndMs,
  isHead,
  isTail,
  leftPct,
  widthPct,
  canEdit,
  onClick,
  dragId,
  segmentDayKey,
  siblings = [],
  onResize,
  readOnlyCourse = false,
  baseMinutes,
  highlighted = false,
}: Props) {
  // While any move/resize is being persisted the whole calendar locks. This block
  // is either the one being saved (distinct cue) or one of the frozen others.
  const savingEntryId = useScheduleManagementStore(selectSavingEntryId)
  const anySaving = savingEntryId !== null
  const isSaving = savingEntryId === entry.id
  const removeCoursePlacement = useScheduleManagementStore(s => s.removeCoursePlacement)

  // Teacher delete: course placements only (entry.placementId set), when editable.
  const canDelete = canEdit && entry.placementId != null && !anySaving
  const onDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const okToDelete = await confirmDialog({
      title: 'Delete this lesson?',
      message: `Remove "${entry.title}" from the schedule?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (okToDelete) removeCoursePlacement(entry)
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: { entryId: entry.id, type: 'entry', originDayKey: segmentDayKey },
    disabled: !canEdit || anySaving,
  })

  const [resizing, setResizing] = useState<ResizeState | null>(null)

  const palette = readOnlyCourse ? COURSE_PALETTE : importancePalette(entry.importance)

  // Day midnight for the segment's day
  const segDayStart = new Date(segmentStartMs)
  segDayStart.setHours(0, 0, 0, 0)
  const segDayStartMs = segDayStart.getTime()

  const baseTopMin = ((segmentStartMs - segDayStartMs) / 60000) - (baseMinutes ?? 0)
  const baseDurationMin = (segmentEndMs - segmentStartMs) / 60000

  const renderTopMin = resizing?.topMin ?? baseTopMin
  const renderDuration = resizing?.durationMin ?? baseDurationMin
  const top = renderTopMin * PIXELS_PER_MINUTE
  const height = Math.max(renderDuration * PIXELS_PER_MINUTE - 2, 22)

  const style: React.CSSProperties = {
    top,
    height,
    left: `calc(${leftPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
    transform: resizing ? undefined : CSS.Translate.toString(transform),
    // Search match uses a distinct AMBER scheme so it stands out from the
    // accent-coloured course blocks around it (the user must notice the jump).
    background: highlighted ? '#FEF3C7' : palette.bg,
    borderInlineStart: `4px solid ${highlighted ? '#F59E0B' : palette.stripe}`,
    color: highlighted ? '#78350F' : palette.text,
    // Saving cue: the block being persisted stays solid; the rest dim while frozen.
    opacity: isDragging ? 0.4 : (anySaving && !isSaving ? 0.55 : 1),
    cursor: isSaving
      ? 'wait'
      : anySaving
        ? 'not-allowed'
        : canEdit ? (isDragging ? 'grabbing' : resizing ? 'ns-resize' : 'grab') : 'pointer',
    touchAction: canEdit ? 'none' : 'auto',
    // Lift + glow the match above neighbouring blocks (saving block also lifts).
    zIndex: isDragging || resizing || isSaving ? 50 : highlighted ? 40 : 1,
    boxShadow: highlighted
      ? '0 0 0 3px rgba(245,158,11,0.45)'
      : isSaving ? '0 0 0 2px var(--accent)' : undefined,
    borderTopLeftRadius: isHead ? 8 : 0,
    borderTopRightRadius: isHead ? 8 : 0,
    borderBottomLeftRadius: isTail ? 8 : 0,
    borderBottomRightRadius: isTail ? 8 : 0,
  }

  const start = new Date(entry.startAt)
  const end = new Date(entry.endAt)

  const startResize = (edge: ResizeEdge) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEdit || !onResize || anySaving) return
    e.stopPropagation()
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)

    const initialPointerY = e.clientY
    const initialStartMs = new Date(entry.startAt).getTime()
    const initialEndMs = new Date(entry.endAt).getTime()

    setResizing({ edge, topMin: baseTopMin, durationMin: baseDurationMin })

    const onMove = (ev: PointerEvent) => {
      const deltaPx = ev.clientY - initialPointerY
      const deltaMin = snapMinutes(pixelsToMinutes(deltaPx))
      const deltaMs = deltaMin * 60000

      if (edge === 'top') {
        const proposed = initialStartMs + deltaMs
        const clamped = clampResize(entry, 'top', proposed, siblings)
        const newTopMin = ((clamped - segDayStartMs) / 60000) - (baseMinutes ?? 0)
        const newDurationMin = (segmentEndMs - clamped) / 60000
        setResizing({ edge, topMin: newTopMin, durationMin: newDurationMin })
      } else {
        const proposed = initialEndMs + deltaMs
        const clamped = clampResize(entry, 'bottom', proposed, siblings)
        const newDurationMin = (clamped - segmentStartMs) / 60000
        setResizing({ edge, topMin: baseTopMin, durationMin: newDurationMin })
      }
    }

    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onEnd)
      handle.removeEventListener('pointercancel', onEnd)

      setResizing(curr => {
        if (!curr) return null
        if (curr.edge === 'top') {
          const newStartMs = segDayStartMs + (curr.topMin + (baseMinutes ?? 0)) * 60000
          if (newStartMs !== initialStartMs) {
            onResize(entry.id, new Date(newStartMs).toISOString(), entry.endAt)
          }
        } else {
          const newEndMs = segmentStartMs + curr.durationMin * 60000
          if (newEndMs !== initialEndMs) {
            onResize(entry.id, entry.startAt, new Date(newEndMs).toISOString())
          }
        }
        return null
      })
    }

    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onEnd)
    handle.addEventListener('pointercancel', onEnd)
  }

  const showTopHandle = canEdit && !!onResize && isHead && !anySaving
  const showBottomHandle = canEdit && !!onResize && isTail && !anySaving

  const showFullDetails = renderDuration >= 30 && isHead

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging || resizing) return
        // A click on the delete control must not also open the lesson detail.
        if ((e.target as HTMLElement).closest?.('[data-delete-btn]')) return
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="absolute shadow-sm hover:shadow-md transition-shadow overflow-hidden select-none group"
      style={style}
    >
      {isSaving && (
        <span
          className="absolute top-1 right-1 z-20 w-3 h-3 rounded-full animate-spin pointer-events-none"
          style={{ border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.7 }}
          aria-hidden
        />
      )}

      {canDelete && (
        <button
          type="button"
          data-delete-btn
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          className="absolute top-1 right-1 z-20 w-5 h-5 rounded-md flex items-center justify-center bg-[var(--surface)]/85 text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--surface)] shadow-sm"
          style={{ cursor: 'pointer' }}
          aria-label="Delete lesson"
          title="Delete lesson"
        >
          <HiOutlineTrash className="text-[12px]" />
        </button>
      )}

      {showTopHandle && (
        <div
          onPointerDown={startResize('top')}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 top-0 h-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-center pt-[1px]"
          style={{ cursor: 'ns-resize', touchAction: 'none' }}
          aria-label="Resize start time"
        >
          <span className="inline-block w-6 h-[3px] rounded-full" style={{ background: palette.stripe }} />
        </div>
      )}

      <div className="px-2 py-1 flex flex-col gap-0.5 h-full pointer-events-none">
        {isHead && (course || !readOnlyCourse) && (
          <div className="flex items-center gap-1 min-w-0">
            {course && (
              <span
                className="text-[10px] font-bold uppercase tracking-wide truncate"
                style={{ color: palette.stripe }}
              >
                {course.code}
              </span>
            )}
            {!readOnlyCourse && (
              <span
                className="ms-auto shrink-0 text-[9px] font-bold rounded-full leading-none px-[5px] py-[1px]"
                style={{ background: palette.stripe, color: '#fff' }}
              >
                {entry.importance}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 min-w-0">
          {!isHead && (
            <span className="text-[9px] uppercase font-bold opacity-60 tracking-wide">cont.</span>
          )}
          <span
            className="text-[10px] font-bold tabular-nums truncate"
            style={{ color: palette.text }}
          >
            {formatTime(start)}–{formatTime(end)}
          </span>
        </div>

        {isHead && (
          <span
            className={`font-semibold leading-tight truncate ${showFullDetails ? 'text-[12px]' : 'text-[10.5px]'}`}
          >
            {entry.lessonNumber && (
              <span className="opacity-60 font-bold">{entry.lessonNumber} · </span>
            )}
            {entry.title}
          </span>
        )}
      </div>

      {showBottomHandle && (
        <div
          onPointerDown={startResize('bottom')}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 h-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-[1px]"
          style={{ cursor: 'ns-resize', touchAction: 'none' }}
          aria-label="Resize end time"
        >
          <span className="inline-block w-6 h-[3px] rounded-full" style={{ background: palette.stripe }} />
        </div>
      )}
    </div>
  )
}
