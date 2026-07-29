import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  HiOutlineCalendarDays,
  HiOutlineChevronLeft,
  HiOutlineMagnifyingGlass,
} from 'react-icons/hi2'
import type { ScheduleLesson } from './schedule-store'

export interface PickerDay {
  id: string
  label: string
}

interface Props {
  anchor: DOMRect
  lessons: ScheduleLesson[] // the FULL lesson catalogue
  placementsByLesson: Record<string, string[]> // lessonId -> day labels it sits on
  days: PickerDay[] // all day rows, for multi-day placement
  currentDayId: string // the day this picker was opened from
  onPick: (lessonId: string) => void // click a row → add it to the current day
  onPickMulti: (lessonId: string, dayIds: string[]) => void // add to several days
  onClose: () => void
}

const WIDTH = 320
const RENDER_CAP = 100 // guard against rendering thousands of DOM nodes at once

const inputCls =
  'w-full h-9 pl-8 pr-3 rounded-[8px] bg-[var(--surface-2)] text-primary text-[13px] outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors'
const selectCls =
  'h-8 px-2 rounded-[8px] bg-[var(--surface-2)] text-primary text-[12px] outline-none border border-[var(--border)] focus:border-[var(--accent)]'

function uniqueLabels(lessons: ScheduleLesson[], key: 'environmentLabel' | 'periodTypeLabel'): string[] {
  const set = new Set<string>()
  for (const l of lessons) {
    const v = l[key]
    if (v) set.add(v)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export default function LessonPicker({
  anchor,
  lessons,
  placementsByLesson,
  days,
  currentDayId,
  onPick,
  onPickMulti,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const [env, setEnv] = useState('')
  const [period, setPeriod] = useState('')
  // When set, the picker switches to a "choose days" view for this lesson.
  const [multiLesson, setMultiLesson] = useState<ScheduleLesson | null>(null)
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const envOptions = useMemo(() => uniqueLabels(lessons, 'environmentLabel'), [lessons])
  const periodOptions = useMemo(() => uniqueLabels(lessons, 'periodTypeLabel'), [lessons])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return lessons.filter((l) => {
      if (env && l.environmentLabel !== env) return false
      if (period && l.periodTypeLabel !== period) return false
      if (!q) return true
      return (
        l.lessonNumber.toLowerCase().includes(q) ||
        l.lessonTitle.toLowerCase().includes(q) ||
        (l.environmentLabel ?? '').toLowerCase().includes(q) ||
        (l.periodTypeLabel ?? '').toLowerCase().includes(q)
      )
    })
  }, [lessons, query, env, period])

  const shown = filtered.slice(0, RENDER_CAP)

  const enterMulti = (lesson: ScheduleLesson) => {
    setMultiLesson(lesson)
    setSelectedDays(new Set(currentDayId ? [currentDayId] : []))
  }

  const toggleDay = (id: string) =>
    setSelectedDays((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const applyMulti = () => {
    if (multiLesson && selectedDays.size > 0) {
      onPickMulti(multiLesson.id, Array.from(selectedDays))
    }
  }

  // Keep the whole popover inside the viewport: clamp height to the available
  // space and flip above the anchor when there isn't enough room below.
  const MARGIN = 8
  const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - WIDTH - MARGIN))
  const spaceBelow = window.innerHeight - anchor.bottom - MARGIN
  const spaceAbove = anchor.top - MARGIN
  const openUp = spaceBelow < 260 && spaceAbove > spaceBelow
  const maxHeight = Math.min(440, openUp ? spaceAbove : spaceBelow)
  const posStyle: CSSProperties = openUp
    ? { bottom: window.innerHeight - anchor.top + 4, left, width: WIDTH, maxHeight }
    : { top: anchor.bottom + 4, left, width: WIDTH, maxHeight }

  return createPortal(
    <>
      {/* Click-catcher closes the popover */}
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} />

      <div
        data-testid="lesson-picker"
        className="fixed z-[61] flex flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        style={posStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {multiLesson ? (
          // ─── Multi-day selection view ──────────────────────────────────────
          <>
            <div className="shrink-0 p-2.5 flex flex-col gap-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMultiLesson(null)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-[7px] text-muted hover:text-primary hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                  aria-label="Back to lessons"
                >
                  <HiOutlineChevronLeft className="text-[15px]" />
                </button>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-primary truncate">Add to days</p>
                  <p className="text-[10.5px] text-muted truncate">
                    {multiLesson.lessonNumber} · {multiLesson.lessonTitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] text-muted">
                  Spans {multiLesson.periodPerUnit} period{multiLesson.periodPerUnit === 1 ? '' : 's'} per day
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDays(new Set(days.map((d) => d.id)))}
                    className="text-[11px] font-semibold text-accent bg-transparent border-none cursor-pointer hover:opacity-80"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDays(new Set())}
                    className="text-[11px] font-semibold text-muted bg-transparent border-none cursor-pointer hover:text-primary"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
              <div className="flex flex-col gap-0.5">
                {days.map((d) => {
                  const checked = selectedDays.has(d.id)
                  const placedHere = (placementsByLesson[multiLesson.id] ?? []).includes(d.label)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDay(d.id)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-[7px] text-left cursor-pointer transition-colors ${
                        checked ? 'bg-accent-light' : 'hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center h-4 w-4 rounded-[4px] border text-white text-[10px] font-bold shrink-0 ${
                          checked ? 'bg-accent border-accent' : 'border-[var(--border)] bg-[var(--surface)]'
                        }`}
                      >
                        {checked ? '✓' : ''}
                      </span>
                      <span className={`flex-1 text-[12.5px] font-semibold ${checked ? 'text-accent' : 'text-primary'}`}>
                        {d.label}
                      </span>
                      {placedHere && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-muted text-[9.5px] font-bold">
                          already here
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="shrink-0 p-2.5 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={applyMulti}
                disabled={selectedDays.size === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[8px] bg-accent text-white text-[12.5px] font-bold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add to {selectedDays.size} day{selectedDays.size === 1 ? '' : 's'}
              </button>
            </div>
          </>
        ) : (
          // ─── Lesson list view ──────────────────────────────────────────────
          <>
            <div className="shrink-0 p-2.5 flex flex-col gap-2 border-b border-[var(--border)]">
              <div className="relative">
                <HiOutlineMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-muted pointer-events-none" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search lessons…"
                  className={inputCls}
                />
              </div>
              <div className="flex gap-2">
                <select className={selectCls} value={env} onChange={(e) => setEnv(e.target.value)}>
                  <option value="">All environments</option>
                  {envOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <select className={selectCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
                  <option value="">All periods</option>
                  {periodOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
              {shown.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-muted">No matching lessons.</div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {shown.map((l) => {
                    const uniqueDays = Array.from(new Set(placementsByLesson[l.id] ?? []))
                    const isPlaced = uniqueDays.length > 0
                    return (
                      <div
                        key={l.id}
                        className={`flex items-center rounded-[7px] transition-colors ${
                          isPlaced ? 'bg-accent-light' : 'hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onPick(l.id)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-l-[7px] text-left cursor-pointer min-w-0 flex-1"
                          title="Add to this day"
                        >
                          <span
                            className={`inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded-[5px] text-[10px] font-bold shrink-0 ${
                              isPlaced ? 'bg-[var(--surface)] text-accent' : 'bg-[var(--surface-2)] text-secondary'
                            }`}
                          >
                            {l.lessonNumber || '—'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block text-[12.5px] font-semibold truncate ${
                                isPlaced ? 'text-accent' : 'text-primary'
                              }`}
                            >
                              {l.lessonTitle || 'Untitled'}
                            </span>
                            {(l.environmentLabel || l.periodTypeLabel) && (
                              <span className="block text-[10.5px] text-muted truncate">
                                {[l.environmentLabel, l.periodTypeLabel].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-secondary text-[9.5px] font-bold whitespace-nowrap"
                            title={`Spans ${l.periodPerUnit} period${l.periodPerUnit === 1 ? '' : 's'} per block`}
                          >
                            {l.periodPerUnit}p
                          </span>
                          {isPlaced && (
                            <span
                              className="shrink-0 max-w-[64px] truncate px-1.5 py-0.5 rounded-full bg-accent text-white text-[9.5px] font-bold whitespace-nowrap"
                              title={`In ${uniqueDays.join(', ')}`}
                            >
                              In {uniqueDays.join(', ')}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => enterMulti(l)}
                          className="shrink-0 h-7 w-7 mr-1 inline-flex items-center justify-center rounded-[6px] text-muted hover:text-accent hover:bg-accent-light cursor-pointer transition-colors"
                          aria-label={`Add ${l.lessonTitle} to multiple days`}
                          title="Add to multiple days…"
                        >
                          <HiOutlineCalendarDays className="text-[15px]" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {filtered.length > RENDER_CAP && (
                <div className="py-2 text-center text-[11px] text-muted">
                  Showing first {RENDER_CAP} of {filtered.length} — refine your search.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  )
}
