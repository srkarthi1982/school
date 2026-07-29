import { useEffect, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  HiOutlineChatBubbleBottomCenterText,
  HiOutlineClipboardDocumentList,
  HiOutlineXMark,
} from 'react-icons/hi2'
import DescriptionEditor from './DescriptionEditor'
import { blockDroppableId, type ScheduleLesson, type SchedulePlacement } from './schedule-store'

interface Props {
  placement: SchedulePlacement
  lesson: ScheduleLesson
  // Resize bounds (in columns) derived from neighbouring blocks + grid edges.
  leftBound: number // smallest startCol this block may take
  rightBound: number // largest end (startCol + span) this block may reach
  // Single click opens the read-only lesson detail popup.
  onShowDetail: () => void
  // Fired once when the block first scrolls into view — prefetches lesson detail.
  onVisible: () => void
  // Fired once when a resize gesture begins (pointer-down on a handle) — lets
  // the page snapshot state so the whole gesture is one undo step.
  onResizeStart: () => void
  // Live, per-move resize of THIS placement only (responsive preview).
  onResize: (startCol: number, span: number) => void
  // Fired once on release if the size changed — lets the page ask about
  // applying the change to duplicate placements of the same lesson.
  onResizeEnd: (startCol: number, span: number) => void
  onRemove: (instanceId: string) => void
  onSaveDescription: (instanceId: string, description: string) => void
  onSaveRemarks: (instanceId: string, remarks: string) => void
  // Report this block's pixel size so the drag overlay can match its span.
  onDragMeasure: (size: { w: number; h: number }) => void
  // True while this placement is the search result being pointed at.
  highlighted?: boolean
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export default function LessonBlock({
  placement,
  lesson,
  leftBound,
  rightBound,
  onShowDetail,
  onVisible,
  onResizeStart,
  onResize,
  onResizeEnd,
  onRemove,
  onSaveDescription,
  onSaveRemarks,
  onDragMeasure,
  highlighted = false,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: placement.id })
  // Drop target for block-on-block swap; disabled while this block is the one
  // being dragged so it can't capture its own drop.
  const { setNodeRef: setDropRef, isOver: swapTarget } = useDroppable({
    id: blockDroppableId(placement.id),
    disabled: isDragging,
  })
  const elRef = useRef<HTMLDivElement | null>(null)
  // Pointer-down position, to tell a real click apart from the click that fires
  // at the end of a drag (so a single click opens detail, a drag doesn't).
  const downPos = useRef<{ x: number; y: number } | null>(null)
  // Prefetch this course's lesson detail once the block first enters the viewport.
  const prefetchedRef = useRef(false)
  useEffect(() => {
    const el = elRef.current
    if (!el || prefetchedRef.current) return
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !prefetchedRef.current) {
        prefetchedRef.current = true
        onVisible()
        obs.disconnect()
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [onVisible])

  // Bring the block into view when it becomes the active search result —
  // also fires on mount, which covers blocks revealed by expanding a week.
  useEffect(() => {
    if (!highlighted) return
    elRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlighted])
  const [noteAnchor, setNoteAnchor] = useState<DOMRect | null>(null)
  const [remarksAnchor, setRemarksAnchor] = useState<DOMRect | null>(null)
  const hasNote = Boolean(placement.description)
  const hasRemarks = Boolean(placement.remarks)

  const setRefs = (el: HTMLDivElement | null) => {
    elRef.current = el
    setNodeRef(el)
    setDropRef(el)
  }

  // Edge-drag resize. cellWidth is derived from the block's own rendered width
  // (it currently spans `span` columns), so it needs no external measurement.
  // setPointerCapture routes every pointermove to the handle until release —
  // without it a real mouse drag is lost to native text selection.
  const startResize = (edge: 'left' | 'right') => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const rect = elRef.current?.getBoundingClientRect()
    if (!rect) return
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    onResizeStart()
    const cellW = rect.width / placement.span
    const startX = e.clientX
    const origStart = placement.startCol
    const origSpan = placement.span
    let curStart = origStart
    let curSpan = origSpan

    const onMove = (ev: PointerEvent) => {
      const deltaCols = Math.round((ev.clientX - startX) / cellW)
      if (edge === 'right') {
        curStart = origStart
        curSpan = clamp(origSpan + deltaCols, 1, rightBound - origStart)
      } else {
        curStart = clamp(origStart + deltaCols, leftBound, origStart + origSpan - 1)
        curSpan = origStart + origSpan - curStart
      }
      onResize(curStart, curSpan)
    }
    const onUp = () => {
      handle.releasePointerCapture?.(e.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      // Only ask/commit when the size actually changed during the drag.
      if (curStart !== origStart || curSpan !== origSpan) onResizeEnd(curStart, curSpan)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  const meta = [lesson.environmentLabel, lesson.periodTypeLabel].filter(Boolean).join(' · ')

  return (
    <div
      ref={setRefs}
      style={{
        gridColumn: `${placement.startCol + 1} / span ${placement.span}`,
        gridRow: 1,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="group relative h-full select-none"
    >
      {/* Draggable body (move). Resize handles + remove stop propagation. */}
      <div
        {...attributes}
        {...listeners}
        onPointerDownCapture={(e) => {
          const r = elRef.current?.getBoundingClientRect()
          if (r) onDragMeasure({ w: r.width, h: r.height })
          downPos.current = { x: e.clientX, y: e.clientY }
        }}
        onClick={(e) => {
          // Ignore the click that ends a drag (pointer moved); a real click opens detail.
          const d = downPos.current
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
          e.stopPropagation()
          onShowDetail()
        }}
        className={`h-full flex flex-col justify-center gap-0.5 px-2.5 py-1.5 rounded-[9px] border cursor-grab active:cursor-grabbing transition-colors overflow-hidden ${
          swapTarget
            ? 'border-2 border-dashed border-[var(--accent)] bg-accent-light'
            : highlighted
              ? 'border-[var(--accent)] bg-accent-light shadow-[0_0_0_3px_var(--accent-light)]'
              : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]'
        }`}
        aria-label={`${lesson.lessonNumber} ${lesson.lessonTitle}`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded-[5px] bg-[var(--surface-2)] text-[10px] font-bold text-secondary shrink-0">
            {lesson.lessonNumber || '—'}
          </span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setNoteAnchor(elRef.current?.getBoundingClientRect() ?? null)
              }}
              className={`h-5 w-5 inline-flex items-center justify-center rounded-[5px] cursor-pointer transition-colors ${
                hasNote
                  ? 'text-accent opacity-100'
                  : 'text-muted opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-accent-light'
              }`}
              aria-label={hasNote ? `Edit note for ${lesson.lessonTitle}` : `Add note to ${lesson.lessonTitle}`}
              title={hasNote ? placement.description : 'Add note'}
            >
              <HiOutlineChatBubbleBottomCenterText className="text-[13px]" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setRemarksAnchor(elRef.current?.getBoundingClientRect() ?? null)
              }}
              className={`h-5 w-5 inline-flex items-center justify-center rounded-[5px] cursor-pointer transition-colors ${
                hasRemarks
                  ? 'text-[#D97706] opacity-100'
                  : 'text-muted opacity-0 group-hover:opacity-100 hover:text-[#D97706] hover:bg-[rgba(217,119,6,0.08)]'
              }`}
              aria-label={hasRemarks ? `Edit remarks for ${lesson.lessonTitle}` : `Add remarks to ${lesson.lessonTitle}`}
              title={hasRemarks ? placement.remarks : 'Add remarks'}
            >
              <HiOutlineClipboardDocumentList className="text-[13px]" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(placement.id)
              }}
              className="h-5 w-5 inline-flex items-center justify-center rounded-[5px] text-muted cursor-pointer hover:text-[#DC2626] hover:bg-[rgba(220,38,38,0.06)] transition-colors opacity-0 group-hover:opacity-100"
              aria-label={`Remove ${lesson.lessonTitle}`}
            >
              <HiOutlineXMark className="text-[13px]" />
            </button>
          </div>
        </div>
        <p className="text-[12px] font-semibold text-primary truncate leading-tight">
          {lesson.lessonTitle || 'Untitled'}
        </p>
        {meta && <p className="text-[10px] text-muted truncate">{meta}</p>}
        {hasNote && (
          <p className="text-[10px] text-accent/90 truncate leading-tight" title={placement.description}>
            {placement.description}
          </p>
        )}
        {hasRemarks && (
          <p className="text-[10px] text-[#B45309] truncate leading-tight" title={placement.remarks}>
            <span className="font-bold">Remarks: </span>{placement.remarks}
          </p>
        )}
      </div>

      {/* Resize handles */}
      <div
        onPointerDown={startResize('left')}
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize touch-none rounded-l-[9px] opacity-0 group-hover:opacity-100 hover:bg-[var(--accent)] hover:opacity-60"
        aria-hidden
      />
      <div
        onPointerDown={startResize('right')}
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize touch-none rounded-r-[9px] opacity-0 group-hover:opacity-100 hover:bg-[var(--accent)] hover:opacity-60"
        aria-hidden
      />

      {noteAnchor && (
        <DescriptionEditor
          anchor={noteAnchor}
          heading="Description"
          lessonTitle={lesson.lessonTitle || 'Untitled'}
          placeholder="Add a note for students — context, prep, what to bring…"
          initialValue={placement.description ?? ''}
          onSave={(value) => onSaveDescription(placement.id, value)}
          onClose={() => setNoteAnchor(null)}
        />
      )}

      {remarksAnchor && (
        <DescriptionEditor
          anchor={remarksAnchor}
          heading="Remarks"
          lessonTitle={lesson.lessonTitle || 'Untitled'}
          placeholder="Instructor remarks — logistics, equipment, internal notes…"
          initialValue={placement.remarks ?? ''}
          onSave={(value) => onSaveRemarks(placement.id, value)}
          onClose={() => setRemarksAnchor(null)}
        />
      )}
    </div>
  )
}
