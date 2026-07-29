import { create } from 'zustand'
import {
  ensureCourseMasterScheduleApiV1CourseMastersMasterIdSchedulePost,
  saveScheduleApiV1SchedulesScheduleIdPut,
} from '../../../api/generated'
// Two schedule schemas share these names (master + course-selection instance),
// so the generated SDK disambiguates them with a module prefix. The shared
// store uses the instance variant: it's a structural superset (adds `calendar`)
// that also fits the master payloads, which simply omit the calendar at runtime.
import type {
  AppModulesCourseSelectionScheduleSchemasScheduleDetailResponse as ScheduleDetailResponse,
  AppModulesCourseSelectionScheduleSchemasScheduleUpsert as ScheduleUpsert,
  AppModulesScheduleSchemasScheduleUpsert as MasterScheduleUpsert,
} from '../../../api/generated'
import { extractErrorMessage } from '../../../infra/shared/utils/apiError'
import { generateId } from '../../../infra/shared/utils/uid'
// Calendar math lives in a neutral util so the Schedule Management viewer can
// reuse it without depending on this course-management store. Re-exported here
// so existing importers of ScheduleCalendar keep working.
import {
  EMPTY_CALENDAR,
  dayLabelFor,
  type ScheduleCalendar,
} from '../../../infra/shared/utils/scheduleCalendar'

export type { ScheduleCalendar }

// ─── API adapter ──────────────────────────────────────────────────────────────
// The schedule screen serves both the Course Builder (master) and Course
// Selection (instance). They use different endpoints, so the store is driven by
// an injected adapter (passed to `load`); the default targets the master.

export interface ScheduleApi {
  ensure: (id: number) => Promise<{ data?: unknown; error?: unknown }>
  save: (
    id: number,
    payload: ScheduleUpsert,
    calendar: ScheduleCalendar,
  ) => Promise<{ data?: unknown; error?: unknown }>
}

const masterScheduleApi: ScheduleApi = {
  ensure: (id) =>
    ensureCourseMasterScheduleApiV1CourseMastersMasterIdSchedulePost({
      path: { master_id: id },
    }),
  // Master has no calendar; the extra arg is ignored. The shared payload is the
  // instance variant (dayLabel optional); the store always sets it, so it's safe
  // to narrow to the master upsert here.
  save: (id, payload) =>
    saveScheduleApiV1SchedulesScheduleIdPut({
      body: payload as MasterScheduleUpsert,
      path: { schedule_id: id },
    }),
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScheduleLesson {
  id: string
  lessonNumber: string
  lessonTitle: string
  environmentLabel: string | null
  periodTypeLabel: string | null
  // TOTAL periods of the lesson (= flight timing); the sum across all its blocks.
  // Display only — NOT the block size, and may exceed a day.
  periods: number
  // Size of ONE block when this lesson is placed on the grid (= period per unit).
  // Falls back to the total when unset. This is what generate/resize use.
  periodPerUnit: number
}

// One placement of a lesson on a day's grid. `id` is a client-only INSTANCE id
// so a lesson can repeat; the backend reassigns ids on save (full replace).
// `startCol`/`span` position the block on the period lane.
export interface SchedulePlacement {
  id: string
  lessonId: string
  startCol: number
  span: number
  // Student-facing note shown alongside the scheduled lesson.
  description?: string
  // Separate instructor remarks (not student-facing).
  remarks?: string
}

export interface ScheduleDay {
  id: string
  dayLabel: string
  items: SchedulePlacement[]
}

// Grid configuration, derived live from Course Information (read-only here).
export interface ScheduleConfig {
  periodsPerDay: number
  totalTrainingDays: number
  // Fractional (e.g. 4.5) when each week ends with a half day.
  trainingDaysPerWeek: number
  // Period capacity of a half day ("Number of Periods per Half Day").
  periodsPerHalfDay: number
  periodDurationMinutes: number
}

export type ScheduleStatus = 'created' | 'draft' | 'complete'

export const MAX_DAYS = 60
export const DEFAULT_PERIODS_PER_DAY = 6

// How many undo steps to keep.
const HISTORY_LIMIT = 50

// A point-in-time copy of the editable schedule state for undo/redo. Days and
// lessonsById are replaced immutably by every action, so storing the references
// is enough; resizedLessonIds is copied since it's a mutable Set.
interface ScheduleSnapshot {
  days: ScheduleDay[]
  lessonsById: Record<string, ScheduleLesson>
  resizedLessonIds: Set<string>
}

const DEFAULT_CONFIG: ScheduleConfig = {
  periodsPerDay: DEFAULT_PERIODS_PER_DAY,
  totalTrainingDays: 5,
  trainingDaysPerWeek: 5,
  periodsPerHalfDay: 3,
  periodDurationMinutes: 45,
}

// ─── Half-day helpers ─────────────────────────────────────────────────────────
// A fractional training week (e.g. 4.5 days/week) means the LAST day of each
// week is a half day — day 5, day 10, … for 4.5. Half days hold only
// `periodsPerHalfDay` columns; all other days hold `periodsPerDay`.

// Day rows per displayed week (4.5 → 5 rows, the 5th being the half day).
export function weekLength(config: ScheduleConfig): number {
  return Math.max(1, Math.ceil(config.trainingDaysPerWeek))
}

export function isHalfDayIndex(dayIndex: number, config: ScheduleConfig): boolean {
  if (config.trainingDaysPerWeek % 1 === 0) return false
  const len = weekLength(config)
  return dayIndex % len === len - 1
}

// Usable period columns of the day at `dayIndex` (0-based across the schedule).
export function colsForDayIndex(dayIndex: number, config: ScheduleConfig): number {
  return isHalfDayIndex(dayIndex, config)
    ? Math.max(1, Math.min(config.periodsPerHalfDay, config.periodsPerDay))
    : config.periodsPerDay
}

// ─── Cell / droppable id helpers ───────────────────────────────────────────────

export const cellDroppableId = (dayId: string, col: number) => `cell:${dayId}:${col}`
export function parseCellId(id: string): { dayId: string; col: number } | null {
  if (!id.startsWith('cell:')) return null
  const rest = id.slice('cell:'.length)
  const sep = rest.lastIndexOf(':')
  if (sep < 0) return null
  return { dayId: rest.slice(0, sep), col: Number(rest.slice(sep + 1)) }
}

// Placed blocks are drop targets too — dropping one block on another swaps them.
export const blockDroppableId = (placementId: string) => `block:${placementId}`
export function parseBlockId(id: string): string | null {
  return id.startsWith('block:') ? id.slice('block:'.length) : null
}

// ─── Grid helpers ───────────────────────────────────────────────────────────

// Boolean[ncols] marking which columns are occupied (optionally ignoring one
// placement, e.g. the one being resized/moved).
export function occupiedCols(items: SchedulePlacement[], ncols: number, excludeId?: string): boolean[] {
  const cov = new Array(ncols).fill(false)
  for (const it of items) {
    if (excludeId && it.id === excludeId) continue
    for (let c = it.startCol; c < it.startCol + it.span && c < ncols; c++) cov[c] = true
  }
  return cov
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function relabel(days: ScheduleDay[], cal?: ScheduleCalendar | null): ScheduleDay[] {
  return days.map((d, i) => {
    const label = dayLabelFor(i, cal)
    return d.dayLabel === label ? d : { ...d, dayLabel: label }
  })
}

function makeDay(index: number, cal?: ScheduleCalendar | null): ScheduleDay {
  return { id: generateId(), dayLabel: dayLabelFor(index, cal), items: [] }
}

// Flatten the grid into one ordered run of placements (day order, then column
// order within a day). This is the canonical sequence the schedule "flows" in.
function orderedSequence(days: ScheduleDay[]): SchedulePlacement[] {
  const seq: SchedulePlacement[] = []
  for (const d of days) {
    const items = [...d.items].sort((a, b) => a.startCol - b.startCol)
    seq.push(...items)
  }
  return seq
}

// Lay an ordered sequence back onto the grid, packing each block tightly after
// the previous one (a block never splits across a day, so one that won't fit in
// the remaining columns starts the next day). Half days hold fewer columns, so
// a block wider than the half day skips it entirely. Existing day rows are kept
// and cleared; new days are appended up to MAX_DAYS when the flow overruns the
// last day. Trailing days may end up empty. Placement ids/notes are preserved.
// Used by the "flow" operations (add / swap / auto-fill) that intentionally
// close gaps; resize uses resolveSchedule() instead to KEEP gaps.
function reflowSequence(
  days: ScheduleDay[],
  config: ScheduleConfig,
  sequence: SchedulePlacement[],
  cal?: ScheduleCalendar | null,
): ScheduleDay[] {
  const maxCols = Math.max(1, config.periodsPerDay)
  const out: ScheduleDay[] =
    days.length > 0 ? days.map((d) => ({ ...d, items: [] as SchedulePlacement[] })) : [makeDay(0, cal)]
  let di = 0
  let col = 0
  for (const item of sequence) {
    const span = clamp(item.span, 1, maxCols)
    // Advance to the first day with enough room left (a half day may not fit
    // the block at all — then it flows to the next full day).
    while (di < MAX_DAYS && col + span > colsForDayIndex(di, config)) {
      di++
      col = 0
    }
    while (di >= out.length && out.length < MAX_DAYS) out.push(makeDay(out.length, cal))
    if (di >= out.length) break // hit MAX_DAYS — drop the overflow (rare)
    out[di].items.push({ ...item, startCol: col, span })
    col += span
    if (col >= colsForDayIndex(di, config)) {
      di++
      col = 0
    }
  }
  return relabel(out, cal)
}

// Resolve overlaps WITHOUT closing gaps. Each block keeps its own startCol unless
// an earlier block actually overlaps it, in which case it's pushed right just
// enough to clear the overlap (cascading). A block pushed past its day's last
// column overflows to the start of the next day (spill, same as reflowSequence);
// extra days are appended up to MAX_DAYS. This is what resize uses so shrinking
// or growing into free periods leaves neighbours untouched — only a genuine
// overlap shifts them.
function resolveSchedule(
  days: ScheduleDay[],
  config: ScheduleConfig,
  cal?: ScheduleCalendar | null,
): ScheduleDay[] {
  const maxCols = Math.max(1, config.periodsPerDay)
  const out: ScheduleDay[] =
    days.length > 0 ? days.map((d) => ({ ...d, items: [] as SchedulePlacement[] })) : [makeDay(0, cal)]
  let carry: SchedulePlacement[] = []
  for (let di = 0; di < out.length && (carry.length > 0 || di < days.length); di++) {
    const cols = colsForDayIndex(di, config)
    let runningEnd = 0
    const nextCarry: SchedulePlacement[] = []
    // Blocks pushed out of the previous day land first, packed from the start.
    for (const it of carry) {
      const span = clamp(it.span, 1, maxCols)
      if (runningEnd + span > cols) { nextCarry.push(it); continue }
      out[di].items.push({ ...it, startCol: runningEnd, span })
      runningEnd += span
    }
    // This day's own blocks keep their column unless an earlier block overlaps.
    const own = di < days.length ? [...days[di].items].sort((a, b) => a.startCol - b.startCol) : []
    for (const it of own) {
      const span = clamp(it.span, 1, maxCols)
      const start = Math.max(it.startCol, runningEnd)
      if (start + span > cols) { nextCarry.push(it); continue }
      out[di].items.push({ ...it, startCol: start, span })
      runningEnd = start + span
    }
    carry = nextCarry
    // Make sure there's a day to receive any overflow on the next iteration.
    if (carry.length > 0 && di + 1 >= out.length && out.length < MAX_DAYS) out.push(makeDay(out.length, cal))
  }
  return relabel(out, cal)
}

// Map the backend detail payload into store shape.
function fromDetail(dto: ScheduleDetailResponse): {
  lessonsById: Record<string, ScheduleLesson>
  days: ScheduleDay[]
} {
  const lessonsById: Record<string, ScheduleLesson> = {}
  for (const l of dto.lessons) {
    lessonsById[String(l.id)] = {
      id: String(l.id),
      lessonNumber: l.lessonNumber ?? '',
      lessonTitle: l.lessonTitle ?? '',
      environmentLabel: l.environmentLabel ?? null,
      periodTypeLabel: l.periodTypeLabel ?? null,
      periods: Math.max(1, l.periods ?? 1),
      periodPerUnit: Math.max(1, l.periodPerUnit ?? l.periods ?? 1),
    }
  }
  const days: ScheduleDay[] = (dto.days ?? []).map((d) => ({
    id: generateId(),
    dayLabel: d.dayLabel ?? '',
    items: (d.items ?? []).map((p) => ({
      id: generateId(),
      lessonId: String(p.lessonId),
      startCol: p.startCol,
      span: p.span,
      description: p.description ?? undefined,
      remarks: p.remarks ?? undefined,
    })),
  }))
  return { lessonsById, days }
}

function snapshotOf(s: {
  days: ScheduleDay[]
  lessonsById: Record<string, ScheduleLesson>
  resizedLessonIds: Set<string>
}): ScheduleSnapshot {
  return { days: s.days, lessonsById: s.lessonsById, resizedLessonIds: new Set(s.resizedLessonIds) }
}

// Wrap an action's state patch so the PRE-mutation state is pushed onto the undo
// stack (and the redo stack is cleared). Only the success path of a mutating
// action should use this — no-op early returns (`return s`) skip it correctly.
function withHistory(s: ScheduleState, patch: Partial<ScheduleState>): Partial<ScheduleState> {
  return {
    ...patch,
    undoStack: [...s.undoStack, snapshotOf(s)].slice(-HISTORY_LIMIT),
    redoStack: [],
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

interface ScheduleState {
  masterId: number | null
  scheduleId: number | null
  courseTitle: string
  courseDate: string | null
  lessonsById: Record<string, ScheduleLesson>
  config: ScheduleConfig
  days: ScheduleDay[]
  status: ScheduleStatus
  loading: boolean
  saving: boolean
  error: string | null
  lastSavedAt: Date | null
  saveTimer: ReturnType<typeof setTimeout> | null
  // Lessons whose flight timing (periods) was changed by resizing a block —
  // their new period count is pushed back to Lesson Creation on save.
  resizedLessonIds: Set<string>

  // Real-date calendar (instance schedules). startDate null → "Day N" labels.
  calendar: ScheduleCalendar
  setCalendar: (cal: ScheduleCalendar) => void

  // Endpoint adapter for this session (master vs instance), set on load.
  api: ScheduleApi

  // When true, resizing pulls neighbours tight (no gaps); blocks that no longer
  // fit the day wrap to the next. When false, gaps are kept (push-on-overlap).
  stickyResize: boolean
  setStickyResize: (v: boolean) => void

  // Undo/redo history of the editable schedule (days + lesson periods).
  undoStack: ScheduleSnapshot[]
  redoStack: ScheduleSnapshot[]
  // Snapshot captured at the start of a resize gesture (committed as one undo
  // step on release) — a resize fires many live updates we don't want to record.
  _resizeBaseline: ScheduleSnapshot | null

  load: (id: number, api?: ScheduleApi) => Promise<void>
  reset: () => void

  // Capture the pre-resize state; commit it as a single undo step on release.
  beginResizeHistory: () => void
  endResizeHistory: () => void
  undo: () => void
  redo: () => void

  // Fill free cells starting at `startCol`; each lesson spans its `periods`.
  addLessonsToDay: (dayId: string, lessonIds: string[], startCol: number) => void
  // Place ONE lesson onto several days at once (from the picker's multi-day mode).
  addLessonToDays: (dayIds: string[], lessonId: string, startCol: number) => void
  // Clear the grid and lay every catalogue lesson out in order. Each lesson is
  // split into `period-per-unit`-sized blocks that together cover its total
  // `periods` (flight timing); blocks pack across days and wrap to the next day
  // when they don't fit (extra days added up to MAX_DAYS). Returns a fill
  // summary (`placed`/`overflow` count fully-laid-out lessons).
  autoFill: () => { placed: number; total: number; daysUsed: number; overflow: number }
  // Resize ONE placement. Other blocks of the same lesson keep their own span
  // (a lesson may be a different size per day). When `commit` is true (on
  // gesture release) the new block size is mirrored onto the lesson's
  // period-per-unit and flagged to persist back to Lesson Creation; the total
  // (flight timing) is recomputed on the server from every block.
  resizePlacement: (
    dayId: string,
    instanceId: string,
    startCol: number,
    span: number,
    commit?: boolean,
  ) => void
  movePlacement: (instanceId: string, toDayId: string, toStartCol: number) => void
  // Swap two placements' positions in the schedule flow. Each block keeps its
  // own span; the whole schedule reflows around the new order.
  swapPlacements: (instanceId: string, otherId: string) => void
  setPlacementDescription: (instanceId: string, description: string) => void
  setPlacementRemarks: (instanceId: string, remarks: string) => void
  removeItem: (instanceId: string) => void
  // Remove every placed block; day rows are kept (only their contents clear).
  clearAllPlacements: () => void
  addDay: () => void
  deleteDay: (dayId: string) => void

  persist: () => Promise<void>
  scheduleAutoSave: () => void
  setComplete: () => void
}

const useScheduleStore = create<ScheduleState>((set, get) => ({
  masterId: null,
  scheduleId: null,
  courseTitle: '',
  courseDate: null,
  lessonsById: {},
  config: DEFAULT_CONFIG,
  days: [],
  status: 'created',
  loading: false,
  saving: false,
  error: null,
  lastSavedAt: null,
  saveTimer: null,
  resizedLessonIds: new Set(),
  calendar: EMPTY_CALENDAR,
  api: masterScheduleApi,
  stickyResize: true,
  undoStack: [],
  redoStack: [],
  _resizeBaseline: null,

  setStickyResize: (v) => set({ stickyResize: v }),

  // Apply a new calendar (from "Generate dates"), relabel all day rows to the
  // resulting dates, and persist it.
  setCalendar: (cal) => {
    set((s) => ({ calendar: cal, days: relabel(s.days, cal) }))
    get().scheduleAutoSave()
  },

  load: async (id, api = masterScheduleApi) => {
    const s = get()
    if (s.loading) return
    if (s.scheduleId != null && s.masterId === id && s.api === api) return
    set({ loading: true, error: null, masterId: id, api })
    const { data, error } = await api.ensure(id)
    if (error) {
      set({ loading: false, error: extractErrorMessage(error) })
      return
    }
    const dto = (data as any)?.data
    if (!dto) {
      set({ loading: false, error: 'No schedule data returned' })
      return
    }
    const { lessonsById, days } = fromDetail(dto)
    // Calendar (instance only); master payloads omit it → "Day N" labels.
    const calendar: ScheduleCalendar = dto.calendar
      ? {
          startDate: dto.calendar.startDate ?? null,
          offWeekdays: dto.calendar.offWeekdays ?? [],
          holidays: dto.calendar.holidays ?? [],
        }
      : EMPTY_CALENDAR
    set({
      scheduleId: dto.id,
      courseTitle: dto.courseTitle ?? '',
      courseDate: dto.courseDate ?? null,
      // Older payloads predate periodsPerHalfDay — default to half the day.
      config: {
        ...dto.config,
        periodsPerHalfDay:
          dto.config.periodsPerHalfDay ?? Math.max(1, Math.ceil(dto.config.periodsPerDay / 2)),
      },
      calendar,
      lessonsById,
      // Labels come from the calendar (or fall back to "Day N").
      days: relabel(days, calendar),
      status: (dto.status as ScheduleStatus) ?? 'created',
      loading: false,
      lastSavedAt: null,
      resizedLessonIds: new Set(),
      undoStack: [],
      redoStack: [],
      _resizeBaseline: null,
    })
  },

  reset: () => {
    const t = get().saveTimer
    if (t) clearTimeout(t)
    set({
      masterId: null,
      scheduleId: null,
      courseTitle: '',
      courseDate: null,
      lessonsById: {},
      config: DEFAULT_CONFIG,
      days: [],
      status: 'created',
      loading: false,
      saving: false,
      error: null,
      lastSavedAt: null,
      saveTimer: null,
      resizedLessonIds: new Set(),
      calendar: EMPTY_CALENDAR,
      api: masterScheduleApi,
      undoStack: [],
      redoStack: [],
      _resizeBaseline: null,
    })
  },

  addLessonsToDay: (dayId, lessonIds, startCol) => {
    if (lessonIds.length === 0) return
    set((s) => {
      const ncols = s.config.periodsPerDay
      const targetIdx = s.days.findIndex((d) => d.id === dayId)
      if (targetIdx < 0) return s
      // Build the ordered sequence and find where this click falls in it, so the
      // new lessons land at that point and everything after them reflows along.
      const seq: SchedulePlacement[] = []
      let insertAt = 0
      s.days.forEach((d, di) => {
        const items = [...d.items].sort((a, b) => a.startCol - b.startCol)
        if (di < targetIdx) {
          insertAt += items.length
          seq.push(...items)
        } else if (di === targetIdx) {
          const before = items.filter((it) => it.startCol < startCol)
          const after = items.filter((it) => it.startCol >= startCol)
          insertAt += before.length
          seq.push(...before, ...after)
        } else {
          seq.push(...items)
        }
      })
      const additions: SchedulePlacement[] = lessonIds.map((lessonId) => ({
        id: generateId(),
        lessonId,
        startCol: 0,
        span: clamp(s.lessonsById[lessonId]?.periodPerUnit ?? 1, 1, ncols),
      }))
      const next = [...seq.slice(0, insertAt), ...additions, ...seq.slice(insertAt)]
      return withHistory(s, { days: reflowSequence(s.days, s.config, next, s.calendar) })
    })
    get().scheduleAutoSave()
  },

  addLessonToDays: (dayIds, lessonId, startCol) => {
    if (dayIds.length === 0) return
    const targets = new Set(dayIds)
    set((s) => {
      const ncols = s.config.periodsPerDay
      const span = clamp(s.lessonsById[lessonId]?.periodPerUnit ?? 1, 1, ncols)
      // Splice one instance into each targeted day at the clicked point, then
      // reflow the whole schedule so the additions push everything after along.
      const next: SchedulePlacement[] = []
      for (const d of s.days) {
        const items = [...d.items].sort((a, b) => a.startCol - b.startCol)
        if (!targets.has(d.id)) {
          next.push(...items)
          continue
        }
        const before = items.filter((it) => it.startCol < startCol)
        const after = items.filter((it) => it.startCol >= startCol)
        next.push(...before, { id: generateId(), lessonId, startCol: 0, span }, ...after)
      }
      return withHistory(s, { days: reflowSequence(s.days, s.config, next, s.calendar) })
    })
    get().scheduleAutoSave()
  },

  autoFill: () => {
    let placed = 0
    let total = 0
    let daysUsed = 0
    set((s) => {
      const ncols = Math.max(1, s.config.periodsPerDay)
      const lessons = Object.values(s.lessonsById) // catalogue (teaching) order
      total = lessons.length
      // Start from the existing day rows but cleared; seed one if there are none.
      const days: ScheduleDay[] =
        s.days.length > 0
          ? s.days.map((d) => ({ ...d, items: [] as SchedulePlacement[] }))
          : [makeDay(0, s.calendar)]
      let di = 0
      let col = 0
      for (const lesson of lessons) {
        const unit = clamp(lesson.periodPerUnit, 1, ncols)
        // Lay the lesson's TOTAL periods (flight timing) out as one or more
        // blocks of `unit` periods each, the last holding the remainder — e.g.
        // periods 5, unit 2 → blocks [2, 2, 1]. This keeps the saved total equal
        // to the flight timing (the backend recomputes it from the placed
        // spans); placing a single unit-sized block would shrink it. The
        // lesson's period-per-unit is NOT changed by auto-fill.
        let remaining = Math.max(1, lesson.periods)
        let fullyPlaced = true
        while (remaining > 0) {
          const span = Math.min(unit, remaining)
          // Advance to the first day with enough room (half days hold fewer
          // periods, so a wide block may skip one entirely).
          while (di < MAX_DAYS && col + span > colsForDayIndex(di, s.config)) {
            di++
            col = 0
          }
          // Grow the schedule (up to MAX_DAYS) so later blocks still land.
          while (di >= days.length && days.length < MAX_DAYS) {
            days.push(makeDay(days.length, s.calendar))
          }
          if (di >= days.length) {
            fullyPlaced = false // hit MAX_DAYS — the rest overflows
            break
          }
          days[di].items.push({ id: generateId(), lessonId: lesson.id, startCol: col, span })
          col += span
          remaining -= span
          if (col >= colsForDayIndex(di, s.config)) {
            di++
            col = 0
          }
        }
        if (!fullyPlaced) break // stop laying out further lessons
        placed++
      }
      daysUsed = days.reduce((n, d) => (d.items.length ? n + 1 : n), 0)
      return withHistory(s, { days: relabel(days, s.calendar) })
    })
    get().scheduleAutoSave()
    return { placed, total, daysUsed, overflow: total - placed }
  },

  resizePlacement: (dayId, instanceId, startCol, span, commit = false) => {
    set((s) => {
      const ncols = s.config.periodsPerDay
      const dayIdx = s.days.findIndex((d) => d.id === dayId)
      const target = dayIdx >= 0 ? s.days[dayIdx].items.find((it) => it.id === instanceId) : undefined
      if (!target) return s
      const { lessonId } = target
      const newSpan = clamp(span, 1, ncols)
      const newStart = clamp(startCol, 0, ncols - 1)

      // Move ONLY this placement to its explicit start/span — other blocks of the
      // same lesson keep their own span (a lesson may differ in size per day).
      const edited = s.days.map((d) => ({
        ...d,
        items: d.items.map((it) =>
          it.id === instanceId ? { ...it, startCol: newStart, span: newSpan } : it,
        ),
      }))
      // Sticky mode: pull every block tight (no gaps) — a block that no longer
      // fits the day's remaining columns wraps to the next day. Default mode:
      // keep gaps, only pushing the blocks the resize actually overlaps.
      const days = s.stickyResize
        ? reflowSequence(s.days, s.config, orderedSequence(edited), s.calendar)
        : resolveSchedule(edited, s.config, s.calendar)

      // Live preview (commit=false): placement only, leave the lesson alone.
      if (!commit) return { days }

      // Commit (on release): mirror the new block size onto the lesson's
      // period-per-unit (default for future placements) and flag it so the save
      // pushes it back to Lesson Creation. The total (flight timing) is NOT
      // touched here — the server recomputes it from every persisted block.
      const lesson = s.lessonsById[lessonId]
      const lessonsById =
        lesson && lesson.periodPerUnit !== newSpan
          ? { ...s.lessonsById, [lessonId]: { ...lesson, periodPerUnit: newSpan } }
          : s.lessonsById

      const resizedLessonIds = new Set(s.resizedLessonIds)
      resizedLessonIds.add(lessonId)

      return { days, lessonsById, resizedLessonIds }
    })
    get().scheduleAutoSave()
  },

  movePlacement: (instanceId, toDayId, toStartCol) => {
    set((s) => {
      let moving: SchedulePlacement | undefined
      let fromDayId: string | undefined
      for (const d of s.days) {
        const it = d.items.find((i) => i.id === instanceId)
        if (it) { moving = it; fromDayId = d.id; break }
      }
      if (!moving || !fromDayId) return s
      const targetIdx = s.days.findIndex((d) => d.id === toDayId)
      if (targetIdx < 0) return s
      const target = s.days[targetIdx]
      // Half days expose fewer usable columns than the full-day grid.
      const ncols = colsForDayIndex(targetIdx, s.config)
      if (toStartCol >= ncols) return s
      // Dropped back on its own slot (e.g. cancelling a drag) — no change, so
      // don't record an empty undo step.
      if (fromDayId === toDayId && moving.startCol === toStartCol) return s
      const cov = occupiedCols(target.items, ncols, instanceId)
      let free = 0
      for (let c = toStartCol; c < ncols && !cov[c]; c++) free++
      if (free < 1) return s
      const placed: SchedulePlacement = { ...moving, startCol: toStartCol, span: Math.min(moving.span, free) }
      return withHistory(s, {
        days: s.days.map((d) => {
          if (d.id === fromDayId && d.id === toDayId) {
            return { ...d, items: [...d.items.filter((i) => i.id !== instanceId), placed] }
          }
          if (d.id === fromDayId) return { ...d, items: d.items.filter((i) => i.id !== instanceId) }
          if (d.id === toDayId) return { ...d, items: [...d.items, placed] }
          return d
        }),
      })
    })
    get().scheduleAutoSave()
  },

  swapPlacements: (instanceId, otherId) => {
    if (instanceId === otherId) return
    set((s) => {
      const seq = orderedSequence(s.days)
      const ia = seq.findIndex((it) => it.id === instanceId)
      const ib = seq.findIndex((it) => it.id === otherId)
      if (ia < 0 || ib < 0) return s
      ;[seq[ia], seq[ib]] = [seq[ib], seq[ia]]
      return withHistory(s, { days: reflowSequence(s.days, s.config, seq, s.calendar) })
    })
    get().scheduleAutoSave()
  },

  setPlacementDescription: (instanceId, description) => {
    const desc = description.trim()
    set((s) =>
      withHistory(s, {
        days: s.days.map((d) =>
          d.items.some((it) => it.id === instanceId)
            ? { ...d, items: d.items.map((it) => (it.id === instanceId ? { ...it, description: desc || undefined } : it)) }
            : d,
        ),
      }),
    )
    get().scheduleAutoSave()
  },

  setPlacementRemarks: (instanceId, remarks) => {
    const note = remarks.trim()
    set((s) =>
      withHistory(s, {
        days: s.days.map((d) =>
          d.items.some((it) => it.id === instanceId)
            ? { ...d, items: d.items.map((it) => (it.id === instanceId ? { ...it, remarks: note || undefined } : it)) }
            : d,
        ),
      }),
    )
    get().scheduleAutoSave()
  },

  removeItem: (instanceId) => {
    set((s) =>
      withHistory(s, {
        days: s.days.map((d) =>
          d.items.some((it) => it.id === instanceId)
            ? { ...d, items: d.items.filter((it) => it.id !== instanceId) }
            : d,
        ),
      }),
    )
    get().scheduleAutoSave()
  },

  clearAllPlacements: () => {
    set((s) =>
      withHistory(s, {
        days: s.days.map((d) => (d.items.length ? { ...d, items: [] } : d)),
      }),
    )
    get().scheduleAutoSave()
  },

  addDay: () => {
    if (get().days.length >= MAX_DAYS) return
    set((s) => withHistory(s, { days: [...s.days, makeDay(s.days.length, s.calendar)] }))
    get().scheduleAutoSave()
  },

  deleteDay: (dayId) => {
    set((s) => {
      if (!s.days.some((d) => d.id === dayId)) return s
      return withHistory(s, { days: relabel(s.days.filter((d) => d.id !== dayId), s.calendar) })
    })
    get().scheduleAutoSave()
  },

  // Resize fires many live updates; capture one baseline at gesture start …
  beginResizeHistory: () => set((s) => ({ _resizeBaseline: snapshotOf(s) })),
  // … and commit it as a single undo step on release (only if a baseline exists).
  endResizeHistory: () => {
    set((s) => {
      if (!s._resizeBaseline) return s
      return {
        undoStack: [...s.undoStack, s._resizeBaseline].slice(-HISTORY_LIMIT),
        redoStack: [],
        _resizeBaseline: null,
      }
    })
  },

  undo: () => {
    set((s) => {
      if (s.undoStack.length === 0) return s
      const prev = s.undoStack[s.undoStack.length - 1]
      return {
        days: prev.days,
        lessonsById: prev.lessonsById,
        resizedLessonIds: prev.resizedLessonIds,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, snapshotOf(s)].slice(-HISTORY_LIMIT),
      }
    })
    get().scheduleAutoSave()
  },

  redo: () => {
    set((s) => {
      if (s.redoStack.length === 0) return s
      const next = s.redoStack[s.redoStack.length - 1]
      return {
        days: next.days,
        lessonsById: next.lessonsById,
        resizedLessonIds: next.resizedLessonIds,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, snapshotOf(s)].slice(-HISTORY_LIMIT),
      }
    })
    get().scheduleAutoSave()
  },

  persist: async () => {
    const { scheduleId, status, days, lessonsById, resizedLessonIds, api, calendar } = get()
    if (scheduleId == null) return
    const payload: ScheduleUpsert = {
      status,
      days: days.map((d) => ({
        dayLabel: d.dayLabel,
        items: d.items.map((it) => ({
          lessonId: Number(it.lessonId),
          startCol: it.startCol,
          span: it.span,
          description: it.description ?? null,
          remarks: it.remarks ?? null,
        })),
      })),
      // Push block-unit-size edits made by resizing back to Lesson Creation.
      // Only resized lessons are sent; the total (flight timing) is recomputed
      // on the server from the persisted blocks.
      lessonUnits: Array.from(resizedLessonIds)
        .map((id) => ({ lessonId: Number(id), periodPerUnit: lessonsById[id]?.periodPerUnit }))
        .filter((lu): lu is { lessonId: number; periodPerUnit: number } => lu.periodPerUnit != null),
    }
    set({ saving: true })
    const { error } = await api.save(scheduleId, payload, calendar)
    if (error) {
      set({ saving: false, error: extractErrorMessage(error) })
      return
    }
    set({ saving: false, lastSavedAt: new Date(), error: null })
  },

  scheduleAutoSave: () => {
    const prev = get().saveTimer
    if (prev) clearTimeout(prev)
    const t = setTimeout(() => {
      set({ saveTimer: null })
      void get().persist()
    }, 800)
    set({ saveTimer: t })
  },

  setComplete: () => {
    set({ status: 'complete' })
    const prev = get().saveTimer
    if (prev) clearTimeout(prev)
    set({ saveTimer: null })
    void get().persist()
  },
}))

export default useScheduleStore
