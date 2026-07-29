import { create } from 'zustand'
import { client } from '../../../api/client'
import {
  listScheduleEntriesApiV1ScheduleEntriesGet  as listEntriesApi,
  createScheduleEntryApiV1ScheduleEntriesPost as createEntryApi,
  updateScheduleEntryApiV1ScheduleEntriesEntryIdPut    as updateEntryApi,
  deleteScheduleEntryApiV1ScheduleEntriesEntryIdDelete as deleteEntryApi,
  listMyScheduleCoursesApiV1CoursesMyScheduleCoursesGet as listMyScheduleCoursesApi,
} from '../../../api/generated'
import type {
  ScheduleEntryResponse,
  MyScheduleCourseItem,
} from '../../../api/generated'
import { throwIfError } from '../../../infra/shared/utils/apiError'
import { availableDayIndexOf, parseISODate, type ScheduleCalendar } from '../../../infra/shared/utils/scheduleCalendar'
import type { ImportanceLevel, ScheduleEntry, ScheduleEntryInput, ViewMode, Course, ScheduleCourse } from './types'
import { SEED_COURSES } from './seed'
import { buildCourseEvents, applyOptimisticMove, applyOptimisticAdd, type CourseSessionScheduleDetail } from './utils/courseEvents'
import useToastStore from '../../../infra/shared/store/useToastStore'

// Schedule Management reads/edits the OPERATIONAL (session) schedule — the fork
// created when a course is approved — not the selection template. Hand-written
// raw client calls (same pattern as the course-selection instanceScheduleApi)
// avoid an SDK regen; the JSON shape is the selection detail plus per-day dates.
const SESSION_BASE = '/api/v1/course-session-schedules'
const readSessionSchedule = (id: number) =>
  (client as any).get({ url: `${SESSION_BASE}/${id}` })

// Monotonic token for course placement moves. Each drag/resize bumps it; a
// server response (PATCH ack or the reconciling re-read) only writes to state if
// it is still the latest move. This is what stops a late/out-of-order response
// from overwriting a fresher optimistic state (the "block jumbling").
let coursePlacementMoveSeq = 0

// Temporary (negative) ids for optimistically-added placements, before the
// server assigns a real one. Negative keeps them distinct from real ids.
let coursePlacementTempId = 0

// Local-date key (yyyy-mm-dd) of a Date, for matching a dropped event against a
// session day's stored date.
const localDateKey = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Convert a clock time (a drag/resize drop, or an empty-slot click) back to the
// period grid: which day row + which start column. Session schedules carry an
// editable per-day date, so match the stored dates first; fall back to the
// calendar walk for un-dated days. Returns null for a day off / before start.
// Convert a clock time (a drag/resize drop, or an empty-slot click) to a session
// slot: which day row + start minute (minutes from midnight). Session schedules
// carry an editable per-day date, so match the stored dates first; fall back to
// the calendar walk for un-dated days. Returns null for a day off / out of range.
const clockToDayMinute = (
  cs: CourseSessionScheduleDetail,
  startISO: string,
): { dayIndex: number; startMinute: number } | null => {
  const cal: ScheduleCalendar = {
    startDate: cs.calendar?.startDate ?? null,
    offWeekdays: cs.calendar?.offWeekdays ?? [],
    holidays: cs.calendar?.holidays ?? [],
  }
  const start = new Date(startISO)
  const days = (cs.days ?? []) as Array<{ date?: string | null }>
  const byStored = days.findIndex((d) => d.date === localDateKey(start))
  const dayIndex = byStored >= 0 ? byStored : availableDayIndexOf(start, cal)
  if (dayIndex == null) return null
  const startMinute = start.getHours() * 60 + start.getMinutes()
  return { dayIndex, startMinute }
}

// Latest end minute among a day's placements, or null when the day is empty.
// Used to auto-place a lesson "after the last lesson" when no exact time is given
// (month-view / keyboard drop).
const lastEndMinuteOnDay = (cs: CourseSessionScheduleDetail, dayIndex: number): number | null => {
  const items = cs.days?.[dayIndex]?.items ?? []
  if (items.length === 0) return null
  return items.reduce((mx, it) => Math.max(mx, it.startMinute + it.durationMinute), 0)
}

// The course's working-day start (config `dayStartTime`, "HH:MM"), used as the
// start for an auto-placed lesson on an otherwise-empty day. Falls back to 08:00.
const courseDayStartMinute = (cs: CourseSessionScheduleDetail): number => {
  const hhmm = (cs.config as { dayStartTime?: string | null } | undefined)?.dayStartTime
  if (hhmm) {
    const [h, m] = hhmm.split(':').map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m
  }
  return 480
}

const fromApi = (e: ScheduleEntryResponse): ScheduleEntry => ({
  id:          e.id,
  version:     e.version,
  course_id:   e.course_id,
  startAt:     e.start_at,
  endAt:       e.end_at,
  title:       e.title,
  description: e.description ?? '',
  importance:  e.importance as ImportanceLevel,
})

const toCreateBody = (i: ScheduleEntryInput) => ({
  course_id:   i.course_id,
  start_at:    i.startAt,
  end_at:      i.endAt,
  title:       i.title,
  description: i.description || null,
  importance:  i.importance,
})

interface ScheduleManagementState {
  entries: ScheduleEntry[]
  loading: boolean
  loaded: boolean
  courses: Course[]
  view: ViewMode
  cursorDate: string
  selectedEntryId: number | null
  modalOpen: boolean
  modalMode: 'create' | 'edit'
  createDefaults: Partial<ScheduleEntryInput> | null
  dayModalOpen: boolean
  dayModalDate: string | null

  // Add-lesson panel (course view): a right-side list of the course's lessons a
  // teacher drags onto the calendar. This flag toggles the panel open/closed.
  lessonPickerOpen: boolean

  // Read-only course schedule viewer (independent of personal entries above).
  // `selectedCourseId === null` → showing the user's personal editable entries.
  myCourses: ScheduleCourse[]
  coursesLoaded: boolean
  selectedCourseId: number | null
  courseLoading: boolean
  courseEvents: ScheduleEntry[]
  // Raw schedule DTO of the selected course, kept so a teacher's move/resize can
  // be converted back to the period grid (config + calendar) and persisted.
  courseSchedule: CourseSessionScheduleDetail | null
  // True when the selected course has no operational schedule yet (not approved)
  // → the viewer shows a "schedule available after approval" empty-state.
  courseUnavailable: boolean

  // Lesson search → jump to an occurrence and highlight it. `focusNonce` bumps on
  // every focus so re-picking the same lesson re-triggers the scroll/highlight.
  highlightEntryId: number | null
  focusNonce: number

  // The id of the entry whose move/resize is currently being persisted, or null.
  // While set, the whole calendar locks drag+resize (the course reconcile swaps
  // the entire schedule, so overlapping in-flight edits would race). Doubles as
  // the marker for the per-block "saving" visual cue.
  savingEntryId: number | null

  setView: (v: ViewMode) => void
  setCursor: (iso: string) => void
  goToday: () => void
  focusEntry: (entryId: number) => void
  clearHighlight: () => void

  fetchMyCourses: () => Promise<void>
  selectCourse: (id: number | null) => Promise<void>
  // Teacher edit: persist a course event's move/resize back to its placement.
  moveCoursePlacement: (entry: ScheduleEntry, newStartISO: string, newEndISO: string) => Promise<void>

  openCreate: (defaults?: Partial<ScheduleEntryInput>) => void
  openEdit: (id: number) => void
  closeModal: () => void

  // Add-lesson flow (course view): a teacher drags a lesson from the side panel
  // onto the calendar. requestCreate/openLessonPicker just toggle the panel.
  requestCreate: (startISO: string) => void
  openLessonPicker: () => void
  closeLessonPicker: () => void
  addCoursePlacement: (lessonId: number, dayIndex: number, startMinute: number, durationMinute: number) => Promise<void>
  // Teacher remove: delete a placed lesson block from the session schedule.
  removeCoursePlacement: (entry: ScheduleEntry) => Promise<void>
  // Place a lesson dragged from the panel. `minuteHint` is the exact start minute
  // from a day/week drop, or null (month / keyboard) to auto-place after the day's
  // last lesson (or the working-day start when the day is empty).
  dropLesson: (lessonId: number, periodPerUnit: number | null | undefined, dayKey: string, minuteHint: number | null) => Promise<void>

  openDayModal: (dateISO: string) => void
  closeDayModal: () => void

  fetch: () => Promise<void>
  addEntry: (input: ScheduleEntryInput) => Promise<void>
  updateEntry: (id: number, input: ScheduleEntryInput) => Promise<void>
  removeEntry: (id: number) => Promise<void>
  moveEntry: (id: number, newStartAt: string, newEndAt: string) => Promise<void>
}

const useScheduleManagementStore = create<ScheduleManagementState>((set, get) => ({
  entries: [],
  loading: false,
  loaded: false,
  courses: SEED_COURSES,
  view: 'week',
  cursorDate: new Date().toISOString(),
  selectedEntryId: null,
  modalOpen: false,
  modalMode: 'create',
  createDefaults: null,
  dayModalOpen: false,
  dayModalDate: null,
  lessonPickerOpen: false,

  myCourses: [],
  coursesLoaded: false,
  selectedCourseId: null,
  courseLoading: false,
  courseEvents: [],
  courseSchedule: null,
  courseUnavailable: false,

  highlightEntryId: null,
  focusNonce: 0,
  savingEntryId: null,

  setView:    (v)   => set({ view: v }),
  setCursor:  (iso) => set({ cursorDate: iso }),
  goToday:    ()    => set({ cursorDate: new Date().toISOString() }),

  // Jump the calendar to an event's occurrence and mark it for highlight. The
  // view is left as-is — each view renders its own window around cursorDate, so
  // Day shows that day, Week the containing week, Month the containing month.
  focusEntry: (entryId) => {
    const entry = selectActiveEntries(get()).find((e) => e.id === entryId)
    if (!entry) return
    set((s) => ({
      cursorDate: entry.startAt,
      highlightEntryId: entryId,
      focusNonce: s.focusNonce + 1,
    }))
  },
  clearHighlight: () => set({ highlightEntryId: null }),

  fetchMyCourses: async () => {
    const { data, error } = await listMyScheduleCoursesApi()
    throwIfError(error)
    const items = (data?.data ?? []) as MyScheduleCourseItem[]
    const courses = items.map((c) => ({
      id: c.id,
      title: c.title,
      startDate: c.start_date ?? null,
      endDate: c.end_date ?? null,
      status: c.status,
      role: (c.role === 'instructor' ? 'instructor' : 'student') as 'student' | 'instructor',
    }))
    set({ myCourses: courses, coursesLoaded: true })
    // There is no "personal schedule" anymore — the view always shows a course.
    // Auto-load the first course so single-course users (typically students) land
    // straight on their schedule; multi-course users (teachers) can switch via the
    // picker. Only auto-selects when nothing is selected yet (preserves a manual
    // choice across remounts).
    if (courses.length > 0 && get().selectedCourseId == null) {
      await get().selectCourse(courses[0].id)
    }
  },

  // Switch the calendar between the personal schedule (null) and a course's
  // read-only schedule. On selecting a course, load + transform its blocks and
  // jump the calendar to the current week if the course is ongoing, else to the
  // week of its start date.
  selectCourse: async (id) => {
    if (id == null) {
      set({ selectedCourseId: null, courseEvents: [], courseSchedule: null, courseUnavailable: false })
      return
    }
    set({ selectedCourseId: id, courseLoading: true })
    try {
      const { data, error } = await readSessionSchedule(id)
      throwIfError(error)
      const dto = (data as { data?: unknown } | undefined)?.data
      // Not approved yet → no operational schedule; show the empty-state.
      if (dto && (dto as { available?: boolean }).available === false) {
        set({ courseSchedule: dto as CourseSessionScheduleDetail, courseEvents: [], courseUnavailable: true })
        return
      }
      const events = dto ? buildCourseEvents(dto as Parameters<typeof buildCourseEvents>[0], id) : []
      set({ courseSchedule: (dto as CourseSessionScheduleDetail) ?? null, courseUnavailable: false })

      const course = get().myCourses.find((c) => c.id === id)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      let target = new Date()
      if (course?.startDate) {
        const start = parseISODate(course.startDate)
        const end = course.endDate ? parseISODate(course.endDate) : null
        const ongoing =
          start.getTime() <= today.getTime() &&
          (!end || today.getTime() <= end.getTime())
        target = ongoing ? new Date() : start
      }
      set({ courseEvents: events, cursorDate: target.toISOString() })
    } finally {
      set({ courseLoading: false })
    }
  },

  openCreate: (defaults) => set({
    modalOpen: true,
    modalMode: 'create',
    selectedEntryId: null,
    createDefaults: defaults ?? null,
  }),
  openEdit: (id) => set({
    modalOpen: true,
    modalMode: 'edit',
    selectedEntryId: id,
    createDefaults: null,
  }),
  closeModal: () => set({ modalOpen: false, selectedEntryId: null, createDefaults: null }),

  openDayModal: (dateISO) => set({ dayModalOpen: true, dayModalDate: dateISO }),
  closeDayModal: () => set({ dayModalOpen: false, dayModalDate: null }),

  fetch: async () => {
    set({ loading: true })
    try {
      const { data, error } = await listEntriesApi({ query: { page: 1, page_size: 500 } })
      throwIfError(error)
      const items = (data?.data ?? []) as ScheduleEntryResponse[]
      set({ entries: items.map(fromApi), loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  addEntry: async (input) => {
    const { data, error } = await createEntryApi({ body: toCreateBody(input) })
    throwIfError(error)
    const created = data?.data as ScheduleEntryResponse
    set(s => ({ entries: [...s.entries, fromApi(created)] }))
  },

  updateEntry: async (id, input) => {
    const current = get().entries.find(e => e.id === id)
    if (!current) throw new Error(`Entry ${id} not found`)
    const { data, error } = await updateEntryApi({
      path: { entry_id: id },
      body: { ...toCreateBody(input), version: current.version },
    })
    throwIfError(error)
    const updated = fromApi(data?.data as ScheduleEntryResponse)
    set(s => ({ entries: s.entries.map(e => e.id === id ? updated : e) }))
  },

  removeEntry: async (id) => {
    const { error } = await deleteEntryApi({ path: { entry_id: id } })
    throwIfError(error)
    set(s => ({
      entries: s.entries.filter(e => e.id !== id),
      selectedEntryId: s.selectedEntryId === id ? null : s.selectedEntryId,
      modalOpen: s.selectedEntryId === id ? false : s.modalOpen,
    }))
  },

  moveEntry: async (id, newStartAt, newEndAt) => {
    // One move/resize at a time — drop any edit that slips through while the
    // previous one is still saving (the UI also locks, this is a safety net).
    if (get().savingEntryId != null) return
    const current = get().entries.find(e => e.id === id)
    if (!current) return
    set({ savingEntryId: id })
    try {
      await get().updateEntry(id, {
        course_id:   current.course_id,
        startAt:     newStartAt,
        endAt:       newEndAt,
        title:       current.title,
        description: current.description,
        importance:  current.importance,
      })
    } finally {
      set({ savingEntryId: null })
    }
  },

  // Teacher move/resize of a course lesson: convert the new clock time to a
  // free-form session slot (day row + start minute + duration) and PATCH the
  // placement, then re-read so the calendar reflects the saved position. Cursor
  // is left untouched so the view doesn't jump.
  moveCoursePlacement: async (entry, newStartISO, newEndISO) => {
    const { selectedCourseId: cid, courseSchedule } = get()
    if (cid == null || courseSchedule == null || entry.placementId == null) return
    // One move/resize at a time — drop any edit that slips through while the
    // previous one is still saving (the UI also locks, this is a safety net).
    if (get().savingEntryId != null) return

    const slot = clockToDayMinute(courseSchedule, newStartISO)
    if (slot == null) {
      // Dropped on a day off / before the start → reload to snap it back.
      await get().selectCourse(cid)
      return
    }
    const { dayIndex, startMinute } = slot
    // Free-form duration, snapped to 15-min steps (min one step). Start/end were
    // already 15-min snapped on drag, so this is just a safety clamp.
    const rawDur = (new Date(newEndISO).getTime() - new Date(newStartISO).getTime()) / 60000
    const durationMinute = Math.max(15, Math.round(rawDur / 15) * 15)

    // Optimistic update: move the block locally right away so it stays where it
    // was dropped/resized, then persist in the background. A snapshot lets us
    // roll back if the PATCH fails.
    const prevSchedule = courseSchedule
    const prevEvents = get().courseEvents
    const optimistic = applyOptimisticMove(courseSchedule, entry.placementId, dayIndex, startMinute, durationMinute)
    const seq = ++coursePlacementMoveSeq
    // Lock the calendar (savingEntryId) until this round-trip settles.
    set({ courseSchedule: optimistic, courseEvents: buildCourseEvents(optimistic, cid), savingEntryId: entry.id })

    try {
      const { error } = await (client as any).patch({
        url: `${SESSION_BASE}/${cid}/placements/${entry.placementId}`,
        body: { dayIndex, startMinute, durationMinute },
        headers: { 'Content-Type': 'application/json' },
      })
      throwIfError(error)

      // Reconcile with the server's stored (clamped) position — but only if no
      // newer move has started, so a late response can't clobber fresher state.
      const re = await readSessionSchedule(cid)
      throwIfError(re.error)
      if (seq !== coursePlacementMoveSeq) return
      const dto = (re.data as { data?: unknown } | undefined)?.data
      if (dto) {
        set({
          courseSchedule: dto as CourseSessionScheduleDetail,
          courseEvents: buildCourseEvents(dto as Parameters<typeof buildCourseEvents>[0], cid),
        })
      }
    } catch (err) {
      // Roll back only if we are still the latest move (don't undo a newer one).
      if (seq === coursePlacementMoveSeq) {
        set({ courseSchedule: prevSchedule, courseEvents: prevEvents })
      }
      // Callers fire-and-forget, so surface the failure here instead of leaving
      // an unhandled rejection; the block has already snapped back.
      useToastStore.getState().push({ variant: 'error', title: 'Could not save the change' })
    } finally {
      // Always release the lock — even on the early `seq` bail-out above — so the
      // calendar can never get stuck disabled.
      set({ savingEntryId: null })
    }
  },

  // Empty-slot click: in a personal view open the entry create modal (default
  // 60-minute block); in a course view just open the lesson panel — placement is
  // done by dragging a lesson onto the calendar.
  requestCreate: (startISO) => {
    const { selectedCourseId: cid } = get()
    if (cid == null) {
      get().openCreate({
        startAt: startISO,
        endAt: new Date(new Date(startISO).getTime() + 60 * 60000).toISOString(),
      })
      return
    }
    set({ lessonPickerOpen: true })
  },
  openLessonPicker: () => set({ lessonPickerOpen: true }),
  closeLessonPicker: () => set({ lessonPickerOpen: false }),

  // Place a lesson dragged from the side panel onto the calendar.
  dropLesson: async (lessonId, periodPerUnit, dayKey, minuteHint) => {
    const { courseSchedule } = get()
    if (courseSchedule == null) return
    // Resolve the day row from the dropped day, reusing the move-time mapping
    // (midnight of that day → its dayIndex). Returns null for a day off.
    const slot = clockToDayMinute(courseSchedule, `${dayKey}T00:00:00`)
    if (slot == null) {
      useToastStore.getState().push({ variant: 'warning', title: 'Pick a working day to add a lesson' })
      return
    }
    const { dayIndex } = slot
    const startMinute = minuteHint != null
      ? Math.max(0, minuteHint)
      : (lastEndMinuteOnDay(courseSchedule, dayIndex) ?? courseDayStartMinute(courseSchedule))
    const periodDur = Math.max(1, courseSchedule.config?.periodDurationMinutes ?? 45)
    const durationMinute = Math.max(15, Math.max(1, periodPerUnit ?? 1) * periodDur)
    await get().addCoursePlacement(lessonId, dayIndex, startMinute, durationMinute)
  },

  // Add a new lesson placement to the session schedule. Optimistic: the block
  // appears immediately with a temp id, then the POST + reconciling re-read swap
  // in the server's real placement. Shares the move sequence token so a later
  // edit's response can't be clobbered by this add's late reconcile.
  addCoursePlacement: async (lessonId, dayIndex, startMinute, durationMinute) => {
    const { selectedCourseId: cid, courseSchedule } = get()
    if (cid == null || courseSchedule == null) return

    const prevSchedule = courseSchedule
    const prevEvents = get().courseEvents
    const tempId = --coursePlacementTempId
    const optimistic = applyOptimisticAdd(courseSchedule, lessonId, dayIndex, startMinute, durationMinute, tempId)
    const seq = ++coursePlacementMoveSeq
    set({ courseSchedule: optimistic, courseEvents: buildCourseEvents(optimistic, cid) })

    try {
      const { error } = await (client as any).post({
        url: `${SESSION_BASE}/${cid}/placements`,
        body: { lessonId, dayIndex, startMinute, durationMinute },
        headers: { 'Content-Type': 'application/json' },
      })
      throwIfError(error)

      const re = await readSessionSchedule(cid)
      throwIfError(re.error)
      if (seq !== coursePlacementMoveSeq) return
      const dto = (re.data as { data?: unknown } | undefined)?.data
      if (dto) {
        set({
          courseSchedule: dto as CourseSessionScheduleDetail,
          courseEvents: buildCourseEvents(dto as Parameters<typeof buildCourseEvents>[0], cid),
        })
      }
    } catch (err) {
      if (seq === coursePlacementMoveSeq) {
        set({ courseSchedule: prevSchedule, courseEvents: prevEvents })
      }
      useToastStore.getState().push({ variant: 'error', title: 'Could not add the lesson' })
    }
  },

  // Delete a placed lesson block. Optimistic: the block disappears immediately,
  // then the DELETE + reconciling re-read confirm it (or roll back on failure).
  removeCoursePlacement: async (entry) => {
    const { selectedCourseId: cid, courseSchedule } = get()
    if (cid == null || courseSchedule == null || entry.placementId == null) return
    if (get().savingEntryId != null) return
    const pid = entry.placementId
    const prevSchedule = courseSchedule
    const prevEvents = get().courseEvents
    const optimistic = {
      ...courseSchedule,
      days: (courseSchedule.days ?? []).map(d => ({ ...d, items: (d.items ?? []).filter(it => it.id !== pid) })),
    }
    const seq = ++coursePlacementMoveSeq
    set({ courseSchedule: optimistic, courseEvents: buildCourseEvents(optimistic, cid), savingEntryId: entry.id })
    try {
      const { error } = await (client as any).delete({
        url: `${SESSION_BASE}/${cid}/placements/${pid}`,
        headers: { 'Content-Type': 'application/json' },
      })
      throwIfError(error)

      const re = await readSessionSchedule(cid)
      throwIfError(re.error)
      if (seq !== coursePlacementMoveSeq) return
      const dto = (re.data as { data?: unknown } | undefined)?.data
      if (dto) {
        set({
          courseSchedule: dto as CourseSessionScheduleDetail,
          courseEvents: buildCourseEvents(dto as Parameters<typeof buildCourseEvents>[0], cid),
        })
      }
    } catch (err) {
      if (seq === coursePlacementMoveSeq) {
        set({ courseSchedule: prevSchedule, courseEvents: prevEvents })
      }
      useToastStore.getState().push({ variant: 'error', title: 'Could not delete the lesson' })
    } finally {
      set({ savingEntryId: null })
    }
  },
}))

export const selectEntries       = (s: ScheduleManagementState) => s.entries
// Entries the calendar should display: a selected course's read-only events,
// otherwise the user's personal editable entries.
export const selectActiveEntries = (s: ScheduleManagementState) =>
  s.selectedCourseId != null ? s.courseEvents : s.entries
export const selectIsCourseView  = (s: ScheduleManagementState) => s.selectedCourseId != null
export const selectMyCourses     = (s: ScheduleManagementState) => s.myCourses
export const selectSelectedCourseId = (s: ScheduleManagementState) => s.selectedCourseId
export const selectCourseLoading = (s: ScheduleManagementState) => s.courseLoading
export const selectCourseUnavailable = (s: ScheduleManagementState) => s.courseUnavailable
export const selectLoading       = (s: ScheduleManagementState) => s.loading
export const selectLoaded        = (s: ScheduleManagementState) => s.loaded
export const selectCourses       = (s: ScheduleManagementState) => s.courses
export const selectView          = (s: ScheduleManagementState) => s.view
export const selectCursor        = (s: ScheduleManagementState) => s.cursorDate
export const selectModalOpen     = (s: ScheduleManagementState) => s.modalOpen
export const selectModalMode     = (s: ScheduleManagementState) => s.modalMode
export const selectSelectedId    = (s: ScheduleManagementState) => s.selectedEntryId
export const selectCreateDefault = (s: ScheduleManagementState) => s.createDefaults
export const selectDayModalOpen  = (s: ScheduleManagementState) => s.dayModalOpen
export const selectDayModalDate  = (s: ScheduleManagementState) => s.dayModalDate
export const selectHighlightEntryId = (s: ScheduleManagementState) => s.highlightEntryId
export const selectSavingEntryId    = (s: ScheduleManagementState) => s.savingEntryId
export const selectFocusNonce       = (s: ScheduleManagementState) => s.focusNonce
export const selectLessonPickerOpen = (s: ScheduleManagementState) => s.lessonPickerOpen
export const selectCourseSchedule   = (s: ScheduleManagementState) => s.courseSchedule

export default useScheduleManagementStore
