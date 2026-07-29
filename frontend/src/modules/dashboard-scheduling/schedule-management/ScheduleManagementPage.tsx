import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineEye, HiOutlineCalendarDays, HiOutlinePencilSquare, HiOutlinePlus, HiOutlinePrinter } from 'react-icons/hi2'
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'
import { canAccess } from '../../../infra/shared/utils/menuUtils'
import { useI18n } from '../../../infra/locales/I18nContext'
import EmptyState from '../../../infra/shared/components/EmptyState'
import useScheduleManagementStore, {
  selectDayModalOpen,
  selectModalOpen,
  selectActiveEntries,
  selectView,
  selectMyCourses,
  selectSelectedCourseId,
  selectCourseLoading,
  selectCourseUnavailable,
  selectHighlightEntryId,
  selectLessonPickerOpen,
  selectSavingEntryId,
  selectCourseSchedule,
} from './store'
import SchedulePrintModal from '../../course-management/_shared/SchedulePrintModal'
import { sessionScheduleToPrintModel } from './utils/printModel'
import LessonScheduleSearch from './components/LessonScheduleSearch'
import ViewToggle from './components/ViewToggle'
import DayView from './components/DayView'
import WeekView from './components/WeekView'
import MonthView from './components/MonthView'
import ScheduleEntryModal from './components/ScheduleEntryModal'
import DayEntriesModal from './components/DayEntriesModal'
import LessonPanel from './components/LessonPanel'
import { snapMinutes, pixelsToMinutes } from './utils/dragHelpers'
import { addMinutes, diffMinutes } from './utils/timeUtils'

export default function ScheduleManagementPage() {
  const { t } = useI18n()
  const userPerms = useAuthStore(selectUserPermissions)
  const canEdit = userPerms.has('schedule_entry:write')

  const { view, modalOpen, dayModalOpen, lessonPickerOpen } = useScheduleManagementStore(
    useShallow(s => ({
      view:         selectView(s),
      modalOpen:    selectModalOpen(s),
      dayModalOpen: selectDayModalOpen(s),
      lessonPickerOpen: selectLessonPickerOpen(s),
    })),
  )
  const openLessonPicker = useScheduleManagementStore(s => s.openLessonPicker)
  const closeLessonPicker = useScheduleManagementStore(s => s.closeLessonPicker)
  const dropLesson = useScheduleManagementStore(s => s.dropLesson)
  // Course schedules are read-only here; the entries that DnD acts on only exist
  // for the (now removed) personal schedule, so this list stays empty.
  const entries      = useScheduleManagementStore(selectActiveEntries)
  const moveEntry   = useScheduleManagementStore(s => s.moveEntry)
  const moveCoursePlacement = useScheduleManagementStore(s => s.moveCoursePlacement)

  const myCourses        = useScheduleManagementStore(selectMyCourses)
  const selectedCourseId = useScheduleManagementStore(selectSelectedCourseId)
  const courseLoading    = useScheduleManagementStore(selectCourseLoading)
  const courseUnavailable = useScheduleManagementStore(selectCourseUnavailable)
  const coursesLoaded    = useScheduleManagementStore(s => s.coursesLoaded)
  const fetchMyCourses   = useScheduleManagementStore(s => s.fetchMyCourses)
  const selectCourse     = useScheduleManagementStore(s => s.selectCourse)
  const focusEntry       = useScheduleManagementStore(s => s.focusEntry)
  const clearHighlight   = useScheduleManagementStore(s => s.clearHighlight)
  const highlightEntryId = useScheduleManagementStore(selectHighlightEntryId)
  // Set while a move/resize is being saved → calendar is locked; show a cue.
  const savingEntryId    = useScheduleManagementStore(selectSavingEntryId)
  const courseSchedule   = useScheduleManagementStore(selectCourseSchedule)

  // Print-to-PDF week-range picker. Built from the operational schedule DTO,
  // snapped onto the period grid so it prints in the shared Course Model
  // Programme layout — same as Course Selection, with real dates in the day rows.
  const [printOpen, setPrintOpen] = useState(false)
  const printModel = useMemo(
    () => (courseSchedule ? sessionScheduleToPrintModel(courseSchedule) : null),
    [courseSchedule],
  )
  const canPrint = printModel != null && printModel.days.length > 0

  useEffect(() => { fetchMyCourses() }, [fetchMyCourses])

  // Fade the search highlight a few seconds after it's set (the jump/scroll has
  // already happened); re-picking re-sets it via focusNonce.
  useEffect(() => {
    if (highlightEntryId == null) return
    const t = setTimeout(() => clearHighlight(), 3000)
    return () => clearTimeout(t)
  }, [highlightEntryId, clearHighlight])

  const selectedCourse = myCourses.find(c => c.id === selectedCourseId)
  const hasCourses = myCourses.length > 0
  const isCourseView = selectedCourseId != null
  // Teachers (users granted teacher:*) may move/resize lessons; students view
  // only. Gated by teacher permission, not by the course membership role.

  const isTeacher = canAccess({ permissions: ['teacher:*'] }, userPerms)
  // A stopped course is on hold: its session schedule is view-only until it is
  // resumed (the backend rejects writes with 409 regardless).
  const courseStopped = (selectedCourse?.status ?? '').toLowerCase() === 'stopped'
  const courseEditable = canEdit && isTeacher && !courseStopped
  // Selector only matters when the user has more than one course to switch
  // between; a single course (typical for students) auto-loads with no picker.
  const showPicker = myCourses.length > 1

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const [draggingId, setDraggingId] = useState<string | null>(null)
  // The lesson currently dragged from the panel → rendered in the DragOverlay so a
  // floating preview follows the cursor (the source tile would be clipped by the
  // panel's overflow). Null while dragging an existing calendar block.
  const [dragLesson, setDragLesson] = useState<{ title: string; number?: string | null } | null>(null)

  const onDragStart = useCallback((e: DragStartEvent) => {
    setDraggingId(String(e.active.id))
    const d = e.active.data.current as { type?: string; lessonTitle?: string; lessonNumber?: string | null } | undefined
    setDragLesson(d?.type === 'lesson' ? { title: d.lessonTitle ?? '', number: d.lessonNumber } : null)
  }, [])

  const onDragMove = useCallback((_e: DragMoveEvent) => {}, [])

  const onDragCancel = useCallback(() => {
    setDraggingId(null)
    setDragLesson(null)
  }, [])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setDraggingId(null)
    setDragLesson(null)
    if (isCourseView ? !courseEditable : !canEdit) return

    // A lesson dragged from the side panel → place it on the dropped day. In
    // day/week the exact drop Y sets the start time; in month (or a keyboard
    // drag) there's no time, so the store auto-places it after the last lesson.
    const lessonData = e.active.data.current as
      | { type?: string; lessonId?: number; periodPerUnit?: number | null }
      | undefined
    if (lessonData?.type === 'lesson' && lessonData.lessonId != null) {
      const over = e.over?.data.current as { dayKey?: string; type?: string } | undefined
      if (!over?.dayKey) return
      let minuteHint: number | null = null
      const draggedTop = e.active.rect.current.translated?.top
      if (over.type === 'day-column' && e.over && draggedTop != null) {
        // Use the dragged block's TOP edge (what the floating preview shows) as the
        // start-time reference — so the lesson lands where its top sits, not under
        // the cursor (which is wherever inside the tile the teacher grabbed).
        minuteHint = snapMinutes(pixelsToMinutes(draggedTop - e.over.rect.top))
      }
      dropLesson(lessonData.lessonId, lessonData.periodPerUnit, over.dayKey, minuteHint)
      return
    }

    const activeData = e.active.data.current as { entryId?: number; originDayKey?: string } | undefined
    const entryId = activeData?.entryId
    const originDayKey = activeData?.originDayKey
    if (entryId == null) return
    const entry = entries.find(x => x.id === entryId)
    if (!entry) return

    const overData = e.over?.data.current as { dayKey?: string; type?: string } | undefined
    const delta = e.delta

    const start = new Date(entry.startAt)
    const end   = new Date(entry.endAt)
    const duration = diffMinutes(start, end)

    let newStart = new Date(start)

    if (view === 'day') {
      const minDelta = snapMinutes(pixelsToMinutes(delta.y))
      newStart = addMinutes(start, minDelta)
    } else if (view === 'week') {
      const minDelta = snapMinutes(pixelsToMinutes(delta.y))
      newStart = addMinutes(start, minDelta)
      if (overData?.type === 'day-column' && overData.dayKey && originDayKey) {
        const [oyy, omm, odd] = originDayKey.split('-').map(Number)
        const [dyy, dmm, ddd] = overData.dayKey.split('-').map(Number)
        const originMid = new Date(oyy, omm - 1, odd).getTime()
        const destMid   = new Date(dyy, dmm - 1, ddd).getTime()
        const dayDeltaMs = destMid - originMid
        if (dayDeltaMs !== 0) {
          newStart = new Date(newStart.getTime() + dayDeltaMs)
        }
      }
    } else if (view === 'month') {
      if (overData?.type === 'month-cell' && overData.dayKey && originDayKey) {
        const [oyy, omm, odd] = originDayKey.split('-').map(Number)
        const [dyy, dmm, ddd] = overData.dayKey.split('-').map(Number)
        const originMid = new Date(oyy, omm - 1, odd).getTime()
        const destMid   = new Date(dyy, dmm - 1, ddd).getTime()
        const dayDeltaMs = destMid - originMid
        if (dayDeltaMs === 0) return
        newStart = new Date(start.getTime() + dayDeltaMs)
      } else {
        return
      }
    }

    const newEnd = addMinutes(newStart, duration)
    if (newStart.getTime() === start.getTime() && newEnd.getTime() === end.getTime()) return
    // Course events persist to their placement; personal entries to the entry API.
    if (isCourseView) {
      if (entry.placementId != null) moveCoursePlacement(entry, newStart.toISOString(), newEnd.toISOString())
    } else {
      moveEntry(entry.id, newStart.toISOString(), newEnd.toISOString())
    }
  }, [canEdit, courseEditable, isCourseView, entries, view, moveEntry, moveCoursePlacement, dropLesson])

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-bold text-[var(--accent)] tracking-[0.09em] uppercase mb-0.5">
            {t('common.management')}
          </p>
          <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">
            {t('nav.scheduleManagement')}
          </h1>
          <p className="text-[12.5px] text-[var(--text-muted)] mt-0.5 max-w-xl">
            {t('schedule.pageDescription')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Lesson search — find a scheduled lesson and jump to its occurrence. */}
          {hasCourses && <LessonScheduleSearch entries={entries} onSelect={focusEntry} />}
          {/* Course picker — only when the user has more than one course. With a
              single course it auto-loads, so no picker is shown. */}
          {showPicker && (
            <select
              value={selectedCourseId ?? ''}
              onChange={(e) => selectCourse(Number(e.target.value))}
              className="text-[13px] font-semibold py-[9px] px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] cursor-pointer max-w-[260px] shrink-0"
              aria-label={t('schedule.coursePicker')}
            >
              {myCourses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}
          {/* Print the schedule week by week (Course Model Programme layout). */}
          {hasCourses && isCourseView && !courseUnavailable && (
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              disabled={courseLoading || !canPrint}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold py-[9px] px-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] cursor-pointer shrink-0 transition-colors hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
              title={t('schedule.printTitle')}
            >
              <HiOutlinePrinter className="text-[15px]" />
              {t('schedule.print')}
            </button>
          )}
        </div>
      </div>

      {hasCourses && isCourseView && courseUnavailable ? (
        // Course is selected but not approved yet → no operational schedule.
        <div className="flex-1 min-h-0">
          <EmptyState
            fill
            icon={<HiOutlineCalendarDays />}
            title={t('schedule.availableAfterApproval')}
            description={t('schedule.availableAfterApprovalHint')}
          />
        </div>
      ) : hasCourses ? (
        <>
          {/* Course-schedule banner — read-only for students, "editing" for a
              teacher who can edit the calendar (drag/resize lessons). */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-[10px] border text-[12px]"
            style={{ background: 'var(--accent-light)', borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            {courseEditable
              ? <HiOutlinePencilSquare className="text-[15px] shrink-0" />
              : <HiOutlineEye className="text-[15px] shrink-0" />}
            <span className="flex-1 min-w-0">
              {courseLoading
                ? t('schedule.courseScheduleLoading')
                : `${t(courseEditable ? 'schedule.courseScheduleEditHint' : 'schedule.courseScheduleHint')}${selectedCourse ? `: ${selectedCourse.title}` : ''}`}
            </span>
            {savingEntryId != null && (
              <span className="flex items-center gap-1.5 shrink-0 font-semibold" aria-live="polite">
                <span
                  className="w-3 h-3 rounded-full animate-spin"
                  style={{ border: '2px solid currentColor', borderTopColor: 'transparent' }}
                  aria-hidden
                />
                {t('schedule.savingChange')}
              </span>
            )}
            {courseEditable && !courseLoading && (
              <button
                type="button"
                onClick={() => (lessonPickerOpen ? closeLessonPicker() : openLessonPicker())}
                aria-pressed={lessonPickerOpen}
                className="flex items-center gap-1 px-2 py-1 rounded-[8px] font-semibold text-white shrink-0 transition-opacity hover:opacity-90"
                style={{ background: lessonPickerOpen ? 'var(--accent-dark)' : 'var(--accent)' }}
              >
                <HiOutlinePlus className="text-[14px]" />
                {t('schedule.addLesson')}
              </button>
            )}
          </div>

          <ViewToggle />

          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
          >
            <div className="flex-1 min-h-0 flex gap-3">
              <div className="flex-1 min-w-0 min-h-0">
                {view === 'day'   && <DayView   canEdit={isCourseView ? courseEditable : canEdit} />}
                {view === 'week'  && <WeekView  canEdit={isCourseView ? courseEditable : canEdit} />}
                {view === 'month' && <MonthView canEdit={isCourseView ? courseEditable : canEdit} />}
              </div>
              {lessonPickerOpen && courseEditable && <LessonPanel />}
            </div>

            {/* Floating preview of a lesson dragged from the panel (portal → not
                clipped by the panel, unlike the in-place source tile). */}
            <DragOverlay dropAnimation={null}>
              {dragLesson ? (
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-[10px] border border-[var(--accent)] bg-[var(--surface)] shadow-lg text-[13px] cursor-grabbing">
                  {dragLesson.number && (
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)]">
                      {dragLesson.number}
                    </span>
                  )}
                  <span className="font-semibold text-[var(--text-primary)]">{dragLesson.title}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {modalOpen && <ScheduleEntryModal canEdit={canEdit} />}
          {dayModalOpen && <DayEntriesModal canEdit={canEdit} />}

          {draggingId && <span className="sr-only">{t('schedule.dragging')}</span>}
        </>
      ) : (
        // No active course → nothing to show (only relevant once courses loaded).
        <div className="flex-1 min-h-0">
          <EmptyState
            fill
            icon={<HiOutlineCalendarDays />}
            title={coursesLoaded ? t('schedule.noActiveCourses') : t('schedule.courseScheduleLoading')}
            description={coursesLoaded ? t('schedule.noActiveCoursesHint') : undefined}
          />
        </div>
      )}

      {printOpen && printModel && (
        <SchedulePrintModal
          courseTitle={printModel.courseTitle}
          days={printModel.days}
          lessonsById={printModel.lessonsById}
          config={printModel.config}
          dayColumnLabel="Date"
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  )
}
