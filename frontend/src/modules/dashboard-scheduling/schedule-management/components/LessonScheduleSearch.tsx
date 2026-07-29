import { useEffect, useMemo, useRef, useState } from 'react'
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { formatTime } from '../utils/timeUtils'
import type { ScheduleEntry } from '../types'

interface Props {
  // Read-only course events (each = one scheduled occurrence with a real date).
  entries: ScheduleEntry[]
  // Fires with the event id so the page can jump the calendar + highlight it.
  onSelect: (entryId: number) => void
}

const MAX_RESULTS = 30

// Mirrors course-management/_shared/ScheduleSearch.tsx, but matches over course
// events (ScheduleEntry) and shows each occurrence's date/time so the user picks
// the specific one to jump to.
export default function LessonScheduleSearch({ entries, onSelect }: Props) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo<ScheduleEntry[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out = entries
      // Match on the lesson title OR its code (lesson_number).
      .filter((e) => `${e.title ?? ''} ${e.lessonNumber ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    return out.slice(0, MAX_RESULTS)
  }, [entries, query])

  // Keep the keyboard-active row visible while arrowing through results.
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (e: ScheduleEntry) => {
    onSelect(e.id)
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

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatTime(d)}`
  }

  return (
    <div className="relative w-[240px]">
      <HiOutlineMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-[var(--text-muted)] pointer-events-none" />
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
        placeholder={t('schedule.searchLessons')}
        aria-label={t('schedule.searchLessons')}
        className="w-full h-9 pl-8 pr-7 rounded-[10px] bg-[var(--surface)] text-[var(--text-primary)] text-[13px] outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors"
      />
      {query && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery('')
            setActive(0)
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-[5px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
          aria-label="Clear search"
        >
          <HiOutlineXMark className="text-[13px]" />
        </button>
      )}

      {showDropdown && (
        <div
          ref={listRef}
          // preventDefault keeps focus on the input so onBlur doesn't close the
          // dropdown before the row's click handler fires.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute right-0 top-full mt-1 w-[300px] max-h-[300px] overflow-y-auto z-30 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-xl p-1.5 flex flex-col gap-0.5"
        >
          {results.length === 0 ? (
            <div className="py-5 text-center text-[12px] text-[var(--text-muted)]">
              {t('schedule.noLessonMatch')}
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pick(r)}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-[7px] text-left cursor-pointer transition-colors ${
                  i === active ? 'bg-[var(--accent-light)]' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-[var(--text-primary)] truncate leading-tight">
                    {r.lessonNumber && (
                      <span className="text-[var(--text-muted)] font-normal">{r.lessonNumber} · </span>
                    )}
                    {r.title || 'Untitled lesson'}
                  </p>
                  <p className="text-[10.5px] text-[var(--text-muted)] truncate">{fmtDate(r.startAt)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
