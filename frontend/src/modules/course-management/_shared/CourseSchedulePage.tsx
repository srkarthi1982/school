import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  HiOutlineArrowUturnLeft,
  HiOutlineArrowUturnRight,
  HiOutlineChevronDown,
  HiOutlineChevronUpDown,
  HiOutlinePlus,
  HiOutlinePrinter,
  HiOutlineSparkles,
  HiOutlineTrash,
} from 'react-icons/hi2'
import { useToast } from '../../../infra/shared/store/useToastStore'
import useFullBleedStore from '../../../infra/shared/store/useFullBleedStore'
import { confirmDialog } from '../../../infra/shared/store/useConfirmStore'
import LessonDetailModal from './LessonDetailModal'
import { prefetchLessonDetails, clearLessonDetails } from './lesson-detail-cache'
import ScheduleHeader from './ScheduleHeader'
import { courseCategoryCrumbs } from './Breadcrumb'
import ScheduleFooter from './ScheduleFooter'
import ScheduleSearch from './ScheduleSearch'
import SchedulePrintModal from './SchedulePrintModal'
import DayColumn from './DayColumn'
import useScheduleStore, {
  MAX_DAYS,
  colsForDayIndex,
  occupiedCols,
  parseBlockId,
  parseCellId,
  weekLength,
  type ScheduleDay,
  type ScheduleApi,
} from './schedule-store'
import { masterLessonDetailApi, type LessonDetailApi } from './lesson-detail-cache'

interface DropPreview {
  dayId: string
  startCol: number
  span: number
}

// dnd-kit resolves the cell under the dragged block's CENTRE; we want its LEFT
// edge so the placeholder lines up with the block's left-most column instead of
// the cursor. Work out how many columns the overlay's left edge sits from the
// resolved cell using the measured rects — the per-column pitch is recovered
// from the overlay's own width, so it stays exact regardless of grid gaps.
function leftEdgeStartCol(
  event: DragOverEvent | DragEndEvent,
  overCol: number,
  span: number,
): number {
  const a = event.active.rect.current.translated
  const o = event.over?.rect
  if (!a || !o || o.width <= 0) return overCol
  const pitch = span > 1 ? (a.width - o.width) / (span - 1) : o.width
  if (pitch <= 0) return overCol
  return overCol + Math.round((a.left - o.left) / pitch)
}

interface CourseSchedulePageProps {
  // Endpoint adapter (master vs instance). Defaults to the master schedule.
  scheduleApi?: ScheduleApi
  // Lesson-detail data source for the popup (master vs instance lessons).
  lessonDetailApi?: LessonDetailApi
  // Back-navigation target; defaults to the Course Builder detail page.
  detailPath?: string
  // Extra toolbar controls (e.g. the instance "Generate dates" button).
  extraToolbar?: ReactNode
}

export default function CourseSchedulePage({
  scheduleApi,
  lessonDetailApi = masterLessonDetailApi,
  detailPath: detailPathProp,
  extraToolbar,
}: CourseSchedulePageProps = {}) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const detailPath = detailPathProp ?? `/course-management/course-builder/${id}`
  // Schedule is shared by Course Builder and Course Selection — derive the
  // breadcrumb scope/list path from the detail path.
  const isBuilder = detailPath.includes('/course-builder')
  const scopeLabel = isBuilder ? 'Course Builder' : 'Course Selection'
  const listPath = detailPath.replace(/\/\d+$/, '')
  const toast = useToast()

  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeSize, setActiveSize] = useState<{ w: number; h: number } | null>(null)
  const [preview, setPreview] = useState<DropPreview | null>(null)
  // Which week sections are collapsed (keyed by week index).
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set())
  // Placement instance flashed after a lesson search; auto-clears below.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // Lesson id whose read-only detail popup is open (null when closed).
  const [detailLessonId, setDetailLessonId] = useState<string | null>(null)
  // Print-to-PDF week-range picker.
  const [printOpen, setPrintOpen] = useState(false)

  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 2500)
    return () => clearTimeout(t)
  }, [highlightId])

  const toggleWeek = (wi: number) =>
    setCollapsedWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(wi)) next.delete(wi)
      else next.add(wi)
      return next
    })

  const {
    lessonsById,
    config,
    days,
    status,
    loading,
    error,
    lastSavedAt,
    courseTitle,
    courseDate,
    calendar,
    load,
    reset,
    addLessonsToDay,
    addLessonToDays,
    autoFill,
    resizePlacement,
    movePlacement,
    swapPlacements,
    setPlacementDescription,
    setPlacementRemarks,
    removeItem,
    clearAllPlacements,
    addDay,
    deleteDay,
    setComplete,
    undo,
    redo,
    beginResizeHistory,
    endResizeHistory,
    stickyResize,
    setStickyResize,
  } = useScheduleStore(
    useShallow((s) => ({
      lessonsById: s.lessonsById,
      config: s.config,
      days: s.days,
      status: s.status,
      loading: s.loading,
      error: s.error,
      lastSavedAt: s.lastSavedAt,
      courseTitle: s.courseTitle,
      courseDate: s.courseDate,
      calendar: s.calendar,
      load: s.load,
      reset: s.reset,
      addLessonsToDay: s.addLessonsToDay,
      addLessonToDays: s.addLessonToDays,
      autoFill: s.autoFill,
      resizePlacement: s.resizePlacement,
      movePlacement: s.movePlacement,
      swapPlacements: s.swapPlacements,
      setPlacementDescription: s.setPlacementDescription,
      setPlacementRemarks: s.setPlacementRemarks,
      removeItem: s.removeItem,
      clearAllPlacements: s.clearAllPlacements,
      addDay: s.addDay,
      deleteDay: s.deleteDay,
      setComplete: s.setComplete,
      undo: s.undo,
      redo: s.redo,
      beginResizeHistory: s.beginResizeHistory,
      endResizeHistory: s.endResizeHistory,
      stickyResize: s.stickyResize,
      setStickyResize: s.setStickyResize,
    })),
  )
  const canUndo = useScheduleStore((s) => s.undoStack.length > 0)
  const canRedo = useScheduleStore((s) => s.redoStack.length > 0)
  const masterId = useScheduleStore((s) => s.masterId)

  const complete = status === 'complete'
  // Instance (Course Selection) schedules carry a real-date calendar generated
  // via "Generate dates"; until a start date exists the day rows are just
  // "Day N" and the category can't be marked complete. The master (Course
  // Builder) schedule has no calendar, so it's never gated.
  const needsDates = !isBuilder && !calendar.startDate

  // Fill the content area edge-to-edge (drops Layout's standard frame padding)
  // so the wide schedule grid has the whole page; restore on unmount.
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  // Undo/redo keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // Load this course's schedule from the backend on mount; clear on unmount so
  // a different course starts fresh.
  useEffect(() => {
    if (id) {
      // Drop any cached lesson detail so re-entering the page reflects edits
      // made in Lesson Creation since last visit; it re-prefetches on view.
      clearLessonDetails(Number(id), lessonDetailApi)
      void load(Number(id), scheduleApi)
    }
    return () => reset()
  }, [id, load, reset, scheduleApi, lessonDetailApi])

  // Prefetch the course-wide lesson-detail bundle when a block scrolls into view.
  const handleLessonVisible = useCallback(() => {
    if (id) prefetchLessonDetails(Number(id), lessonDetailApi)
  }, [id, lessonDetailApi])

  // Toast whenever an auto-save lands (skip the initial null).
  useEffect(() => {
    if (!lastSavedAt) return
    toast.success({ title: 'Schedule saved' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSavedAt])

  // 8px activation so edge-resize / clicks aren't swallowed by drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const total = Object.keys(lessonsById).length
  const allLessons = Object.values(lessonsById)
  const placementsByLesson: Record<string, string[]> = {}
  for (const d of days)
    for (const it of d.items) (placementsByLesson[it.lessonId] ??= []).push(d.dayLabel)
  // Progress = distinct catalogue lessons scheduled at least once.
  const placed = Object.keys(placementsByLesson).length

  // Group day rows into weeks for display only — dayLabel stays continuous
  // ("Day 1..N"); the last week may be partial. Fractional days/week (e.g.
  // 4.5) rounds up so the half day is the week's last row.
  const perWeek = weekLength(config)
  const weeks: ScheduleDay[][] = []
  for (let i = 0; i < days.length; i += perWeek) weeks.push(days.slice(i, i + perWeek))

  // Flat day list for the picker's multi-day placement mode.
  const allDays = days.map((d) => ({ id: d.id, label: d.dayLabel }))

  // Jump to a searched lesson: expand its week if collapsed, then highlight —
  // the block scrolls itself into view when its `highlighted` prop turns on.
  const handleSearchSelect = (placementId: string, dayId: string) => {
    const dayIndex = days.findIndex((d) => d.id === dayId)
    if (dayIndex >= 0) {
      const wi = Math.floor(dayIndex / perWeek)
      setCollapsedWeeks((prev) => {
        if (!prev.has(wi)) return prev
        const next = new Set(prev)
        next.delete(wi)
        return next
      })
    }
    setHighlightId(placementId)
  }

  // Collapse/expand-all toggle so you can focus on one week at a time.
  const allCollapsed = weeks.length > 0 && collapsedWeeks.size >= weeks.length
  const toggleAllWeeks = () =>
    setCollapsedWeeks(allCollapsed ? new Set() : new Set(weeks.map((_, i) => i)))

  // activeSize is captured on pointer-down via onDragMeasure (reliable), so the
  // overlay already matches the block's resized span by the time drag starts.
  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))

  // Preview the multi-cell footprint the dragged block would occupy, clamped to
  // the free run in the hovered day (so it matches what the drop will keep).
  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null
    // Hovering another block targets a swap — the block shows its own swap
    // highlight, so the cell-footprint preview is cleared.
    if (overId && parseBlockId(overId)) { setPreview(null); return }
    const cell = overId ? parseCellId(overId) : null
    if (!cell) { setPreview(null); return }
    const activeIdStr = String(event.active.id)
    const dayIndex = days.findIndex((d) => d.id === cell.dayId)
    if (dayIndex < 0) { setPreview(null); return }
    const day = days[dayIndex]
    // Half days expose fewer usable columns than the full-day grid.
    const dayCols = colsForDayIndex(dayIndex, config)
    if (cell.col >= dayCols) { setPreview(null); return }
    const dragged = days.flatMap((d) => d.items).find((p) => p.id === activeIdStr)
    const span = dragged?.span ?? 1
    // Anchor the footprint at the block's LEFT edge, not the hovered cell.
    const startCol = Math.max(0, leftEdgeStartCol(event, cell.col, span))
    if (startCol >= dayCols) { setPreview(null); return }
    const cov = occupiedCols(day.items, dayCols, activeIdStr)
    let free = 0
    for (let c = startCol; c < dayCols && !cov[c]; c++) free++
    if (free < 1) { setPreview(null); return }
    setPreview({ dayId: cell.dayId, startCol, span: Math.min(span, free) })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const overId = over ? String(over.id) : null
    const blockTarget = overId ? parseBlockId(overId) : null
    if (blockTarget && blockTarget !== String(active.id)) {
      // Dropped on another block — swap the two positions (sizes preserved)
      // and let the store reflow the rest of the schedule around them.
      swapPlacements(String(active.id), blockTarget)
    } else {
      const cell = overId ? parseCellId(overId) : null
      if (cell) {
        const dragged = days.flatMap((d) => d.items).find((p) => p.id === String(active.id))
        const startCol = Math.max(0, leftEdgeStartCol(event, cell.col, dragged?.span ?? 1))
        movePlacement(String(active.id), cell.dayId, startCol)
      }
    }
    setActiveId(null)
    setActiveSize(null)
    setPreview(null)
  }

  const cancelDrag = () => {
    setActiveId(null)
    setActiveSize(null)
    setPreview(null)
  }

  const handleAddDay = () => {
    if (days.length >= MAX_DAYS) {
      toast.warning({ title: `Maximum ${MAX_DAYS} days reached` })
      return
    }
    addDay()
  }

  const handleDeleteDay = async (dayId: string) => {
    const day = days.find((d) => d.id === dayId)
    if (day && day.items.length > 0) {
      const ok = await confirmDialog({
        title: `Delete ${day.dayLabel}?`,
        message: `${day.dayLabel} has ${day.items.length} lesson(s). Deleting it removes the day and its lessons.`,
        confirmLabel: 'Delete day',
        tone: 'danger',
      })
      if (!ok) return
    }
    deleteDay(dayId)
  }

  const handleMarkComplete = () => {
    if (needsDates) {
      toast.warning({
        title: 'Generate dates first',
        body: 'Assign real calendar dates to the day rows before marking the schedule complete.',
      })
      return
    }
    setComplete()
    toast.success({ title: 'Schedule marked complete' })
  }

  const placedCount = days.reduce((n, d) => n + d.items.length, 0)

  // Live preview while dragging a block's edge — only this placement changes.
  const handleResizeLive = (dayId: string, instanceId: string, startCol: number, span: number) =>
    resizePlacement(dayId, instanceId, startCol, span, false)

  // Committed on release. Apply the final size to THIS block and mirror it onto
  // the lesson's period-per-unit (no confirmation — each block may differ per
  // day). The lesson total (flight timing) is recomputed on the server from
  // every persisted block.
  const handleResizeCommit = (dayId: string, instanceId: string, startCol: number, span: number) => {
    // Commit the resize gesture as a single undo step (baseline captured on
    // pointer-down); every live update + this commit belong to it.
    endResizeHistory()
    resizePlacement(dayId, instanceId, startCol, span, true)
  }

  const handleClearAll = async () => {
    const ok = await confirmDialog({
      title: 'Clear the whole schedule?',
      message: `Remove all ${placedCount} scheduled lesson block${placedCount === 1 ? '' : 's'}? The day rows are kept.`,
      confirmLabel: 'Clear all',
      tone: 'danger',
    })
    if (!ok) return
    clearAllPlacements()
    toast.success({ title: 'Schedule cleared' })
  }

  const handleAutoFill = async () => {
    if (placedCount > 0) {
      const ok = await confirmDialog({
        title: 'Auto-fill the schedule?',
        message:
          'Auto-fill will clear the current schedule and lay out every lesson in order, splitting each into period-per-unit blocks that cover its total periods (long lessons spill to later days).',
        confirmLabel: 'Auto-fill',
      })
      if (!ok) return
    }
    const { placed, total, daysUsed, overflow } = autoFill()
    if (overflow > 0) {
      toast.warning({
        title: `Auto-filled ${placed} of ${total} lessons`,
        body: `${overflow} didn't fit — reached the ${MAX_DAYS}-day limit. Increase periods/day or course duration to fit the rest.`,
      })
    } else {
      toast.success({
        title: `Auto-filled ${placed} lesson${placed === 1 ? '' : 's'}`,
        body: `Laid out across ${daysUsed} day${daysUsed === 1 ? '' : 's'}, each lesson split into period-per-unit blocks.`,
      })
    }
  }

  // activeId is a placement instance id — resolve it to its lesson for the overlay.
  const activeLesson = (() => {
    if (!activeId) return null
    for (const d of days) {
      const it = d.items.find((p) => p.id === activeId)
      if (it) return lessonsById[it.lessonId] ?? null
    }
    return null
  })()

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScheduleHeader
        courseTitle={courseTitle || 'Untitled course'}
        courseDate={courseDate}
        placed={placed}
        total={total}
        periodsPerDay={config.periodsPerDay}
        periodMinutes={config.periodDurationMinutes}
        onBack={() => navigate(detailPath)}
        backLabel={`Back to ${scopeLabel}`}
        crumbs={courseCategoryCrumbs({
          scopeLabel,
          listPath,
          courseTitle,
          detailPath,
          categoryLabel: 'Schedule',
        })}
      >
        <ScheduleSearch days={days} lessonsById={lessonsById} onSelect={handleSearchSelect} />
      </ScheduleHeader>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={cancelDrag}
      >
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <label
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-secondary cursor-pointer select-none shrink-0"
                title="When on, resizing a block pulls its neighbours tight (no gaps); a neighbour that no longer fits the day wraps to the next."
              >
                <input
                  type="checkbox"
                  checked={stickyResize}
                  onChange={(e) => setStickyResize(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent)] cursor-pointer"
                />
                Sticky resize
              </label>
              <div className="flex items-center gap-2 shrink-0">
                {extraToolbar}
                <div className="inline-flex rounded-[8px] border border-[var(--border)] overflow-hidden">
                  <button
                    type="button"
                    onClick={undo}
                    disabled={!canUndo}
                    className="inline-flex items-center justify-center px-2.5 py-1.5 bg-[var(--surface-2)] text-secondary cursor-pointer hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-none border-e border-[var(--border)]"
                    title="Undo (Ctrl+Z)"
                    aria-label="Undo"
                  >
                    <HiOutlineArrowUturnLeft className="text-[15px]" />
                  </button>
                  <button
                    type="button"
                    onClick={redo}
                    disabled={!canRedo}
                    className="inline-flex items-center justify-center px-2.5 py-1.5 bg-[var(--surface-2)] text-secondary cursor-pointer hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-none"
                    title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                    aria-label="Redo"
                  >
                    <HiOutlineArrowUturnRight className="text-[15px]" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={toggleAllWeeks}
                  disabled={weeks.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] text-secondary text-[12px] font-semibold border border-[var(--border)] cursor-pointer hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={allCollapsed ? 'Expand all weeks' : 'Collapse all weeks to focus on one'}
                >
                  <HiOutlineChevronUpDown className="text-[14px]" />
                  {allCollapsed ? 'Expand all' : 'Collapse all'}
                </button>
                <button
                  type="button"
                  onClick={() => setPrintOpen(true)}
                  disabled={loading || days.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] text-secondary text-[12px] font-semibold border border-[var(--border)] cursor-pointer hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Print the schedule week by week (Course Model Programme layout)"
                >
                  <HiOutlinePrinter className="text-[14px]" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={loading || placedCount === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] text-[#DC2626] text-[12px] font-semibold border border-[var(--border)] cursor-pointer hover:bg-[rgba(220,38,38,0.06)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Remove every scheduled lesson block (day rows are kept)"
                >
                  <HiOutlineTrash className="text-[14px]" />
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={loading || total === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Place all lessons into the schedule automatically"
                >
                  <HiOutlineSparkles className="text-[14px]" />
                  Auto-fill schedule
                </button>
              </div>
            </div>
            {error && (
              <div className="rounded-[8px] border border-[#FCA5A5] bg-[rgba(220,38,38,0.06)] px-3 py-2 text-[12px] text-[#DC2626]">
                {error}
              </div>
            )}
            {loading && days.length === 0 ? (
              <div className="py-16 text-center text-[13px] text-muted">Loading schedule…</div>
            ) : null}
            {weeks.map((weekDays, wi) => {
              const collapsed = collapsedWeeks.has(wi)
              const weekLessons = weekDays.reduce((sum, d) => sum + d.items.length, 0)
              return (
                <div key={wi} className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => toggleWeek(wi)}
                    aria-expanded={!collapsed}
                    className="group flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer text-left w-full"
                  >
                    <HiOutlineChevronDown
                      className={`text-[14px] text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`}
                    />
                    <span className="text-[11px] font-bold text-secondary tracking-[0.06em] uppercase group-hover:text-primary transition-colors">
                      Week {wi + 1}
                    </span>
                    <span className="text-[10.5px] text-muted">
                      {weekDays.length} {weekDays.length === 1 ? 'day' : 'days'}
                      {collapsed && weekLessons > 0 && ` · ${weekLessons} ${weekLessons === 1 ? 'lesson' : 'lessons'}`}
                    </span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                  </button>
                  {!collapsed &&
                    weekDays.map((day, di) => (
                      <DayColumn
                        key={day.id}
                        day={day}
                        lessonsById={lessonsById}
                        allLessons={allLessons}
                        placementsByLesson={placementsByLesson}
                        allDays={allDays}
                        canDelete={days.length > 1}
                        activeId={activeId}
                        ncols={colsForDayIndex(wi * perWeek + di, config)}
                        gridCols={config.periodsPerDay}
                        periodMinutes={config.periodDurationMinutes}
                        preview={preview && preview.dayId === day.id ? { startCol: preview.startCol, span: preview.span } : null}
                        highlightId={highlightId}
                        onDeleteDay={handleDeleteDay}
                        onRemoveItem={removeItem}
                        onShowLessonDetail={setDetailLessonId}
                        onLessonVisible={handleLessonVisible}
                        onResizeItemStart={beginResizeHistory}
                        onResizeItem={handleResizeLive}
                        onResizeItemEnd={handleResizeCommit}
                        onSaveDescription={setPlacementDescription}
                        onSaveRemarks={setPlacementRemarks}
                        onAddLessons={addLessonsToDay}
                        onAddLessonsMulti={addLessonToDays}
                        onDragMeasure={setActiveSize}
                      />
                    ))}
                </div>
              )
            })}

            <button
              type="button"
              onClick={handleAddDay}
              disabled={days.length >= MAX_DAYS}
              className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-accent-light text-accent text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <HiOutlinePlus className="text-[13px]" />
              Add Day
            </button>
          </div>
        </div>

        <DragOverlay>
          {activeLesson ? (
            <div
              style={activeSize ? { width: activeSize.w, height: activeSize.h } : { width: 140 }}
              className="flex flex-col justify-center gap-0.5 px-2.5 py-1.5 rounded-[9px] border border-[var(--accent)] bg-[var(--surface)] shadow-lg overflow-hidden cursor-grabbing"
            >
              <span className="inline-flex items-center justify-center h-5 w-fit min-w-[22px] px-1 rounded-[5px] bg-[var(--surface-2)] text-[10px] font-bold text-secondary">
                {activeLesson.lessonNumber || '—'}
              </span>
              <span className="text-[12px] font-semibold text-primary truncate leading-tight">
                {activeLesson.lessonTitle || 'Untitled'}
              </span>
              {(activeLesson.environmentLabel || activeLesson.periodTypeLabel) && (
                <span className="text-[10px] text-muted truncate">
                  {[activeLesson.environmentLabel, activeLesson.periodTypeLabel].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ScheduleFooter
        lastSavedAt={lastSavedAt}
        complete={complete}
        needsDates={needsDates}
        onBack={() => navigate(detailPath)}
        onMarkComplete={handleMarkComplete}
      />

      {printOpen && (
        <SchedulePrintModal
          courseTitle={courseTitle || 'Untitled course'}
          days={days}
          lessonsById={lessonsById}
          config={config}
          dayColumnLabel={isBuilder ? 'Day' : 'Date'}
          onClose={() => setPrintOpen(false)}
        />
      )}

      {detailLessonId != null && masterId != null && lessonsById[detailLessonId] && (
        <LessonDetailModal
          masterId={masterId}
          lessonId={Number(detailLessonId)}
          api={lessonDetailApi}
          fallback={{
            lessonNumber: lessonsById[detailLessonId].lessonNumber,
            lessonTitle: lessonsById[detailLessonId].lessonTitle,
            environmentLabel: lessonsById[detailLessonId].environmentLabel,
            periodTypeLabel: lessonsById[detailLessonId].periodTypeLabel,
            periods: lessonsById[detailLessonId].periods,
            periodPerUnit: lessonsById[detailLessonId].periodPerUnit,
          }}
          onClose={() => setDetailLessonId(null)}
        />
      )}
    </div>
  )
}
