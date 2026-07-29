import { useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2'
import type { ScheduleDay, ScheduleLesson } from './schedule-store'

interface Props {
  days: ScheduleDay[]
  lessonsById: Record<string, ScheduleLesson>
  // Fires with the placement instance + its day so the page can scroll/highlight.
  onSelect: (placementId: string, dayId: string) => void
}

// One row per PLACEMENT (not per lesson) so repeated lessons are all findable.
interface Result {
  placementId: string
  dayId: string
  dayLabel: string
  lesson: ScheduleLesson
}

const MAX_RESULTS = 30

export default function ScheduleSearch({ days, lessonsById, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: Result[] = []
    for (const d of days) {
      for (const it of d.items) {
        const lesson = lessonsById[it.lessonId]
        if (!lesson) continue
        const match =
          lesson.lessonNumber.toLowerCase().includes(q) ||
          lesson.lessonTitle.toLowerCase().includes(q) ||
          (lesson.environmentLabel ?? '').toLowerCase().includes(q) ||
          (lesson.periodTypeLabel ?? '').toLowerCase().includes(q)
        if (match) out.push({ placementId: it.id, dayId: d.id, dayLabel: d.dayLabel, lesson })
        if (out.length >= MAX_RESULTS) return out
      }
    }
    return out
  }, [days, lessonsById, query])

  // Keep the keyboard-active row visible while arrowing through results.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (r: Result) => {
    onSelect(r.placementId, r.dayId)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(results[Math.min(active, results.length - 1)])
    }
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <div className="relative w-[260px]">
      <HiOutlineMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-muted pointer-events-none" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Search scheduled lessons…"
        aria-label="Search scheduled lessons"
        className="w-full h-8 pl-8 pr-7 rounded-[8px] bg-[var(--surface-2)] text-primary text-[12px] outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors"
      />
      {query && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery('')
            setActive(0)
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-[5px] text-muted cursor-pointer hover:text-primary hover:bg-[var(--surface)] transition-colors"
          aria-label="Clear search"
        >
          <HiOutlineXMark className="text-[13px]" />
        </button>
      )}

      {showDropdown && (
        <div
          ref={listRef}
          // preventDefault keeps focus on the input so onBlur doesn't close
          // the dropdown before the row's click handler fires.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute right-0 top-full mt-1 w-[320px] max-h-[300px] overflow-y-auto z-30 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-xl p-1.5 flex flex-col gap-0.5"
        >
          {results.length === 0 ? (
            <div className="py-5 text-center text-[12px] text-muted">
              No scheduled lessons match.
            </div>
          ) : (
            results.map((r, i) => {
              const meta = [r.lesson.environmentLabel, r.lesson.periodTypeLabel]
                .filter(Boolean)
                .join(' · ')
              return (
                <button
                  key={r.placementId}
                  type="button"
                  onClick={() => pick(r)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-[7px] text-left cursor-pointer transition-colors ${
                    i === active ? 'bg-accent-light' : ''
                  }`}
                >
                  <span className="inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded-[5px] bg-[var(--surface-2)] text-[10px] font-bold text-secondary shrink-0">
                    {r.lesson.lessonNumber || '—'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-primary truncate leading-tight">
                      {r.lesson.lessonTitle || 'Untitled'}
                    </p>
                    {meta && <p className="text-[10px] text-muted truncate">{meta}</p>}
                  </div>
                  <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-muted text-[9.5px] font-bold">
                    {r.dayLabel}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
