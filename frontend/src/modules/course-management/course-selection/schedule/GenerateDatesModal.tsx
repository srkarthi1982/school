import { useEffect, useState } from 'react'
import { HiOutlineXMark, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2'
import useScheduleStore from '../../_shared/schedule-store'

// Python weekday convention (Mon=0 … Sun=6) to match the backend storage.
const WEEKDAYS: { n: number; label: string }[] = [
  { n: 0, label: 'Mon' },
  { n: 1, label: 'Tue' },
  { n: 2, label: 'Wed' },
  { n: 3, label: 'Thu' },
  { n: 4, label: 'Fri' },
  { n: 5, label: 'Sat' },
  { n: 6, label: 'Sun' },
]

interface Props {
  onClose: () => void
}

/**
 * Collects the calendar inputs and generates real dates for the instance
 * schedule: the start date, which weekdays are off, and any specific holiday
 * dates to skip. Day rows are then labelled with consecutive available dates.
 */
export default function GenerateDatesModal({ onClose }: Props) {
  const calendar = useScheduleStore((s) => s.calendar)
  const setCalendar = useScheduleStore((s) => s.setCalendar)
  // The instance's start date, surfaced as the default first training day.
  const courseDate = useScheduleStore((s) => s.courseDate)

  const [startDate, setStartDate] = useState<string>(calendar.startDate ?? courseDate ?? '')
  const [offWeekdays, setOffWeekdays] = useState<Set<number>>(
    () => new Set(calendar.startDate ? calendar.offWeekdays : [5, 6]),
  )
  const [holidays, setHolidays] = useState<string[]>(calendar.holidays)
  const [holidayInput, setHolidayInput] = useState<string>('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleWeekday = (n: number) =>
    setOffWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  const addHoliday = () => {
    if (!holidayInput) return
    setHolidays((prev) => (prev.includes(holidayInput) ? prev : [...prev, holidayInput].sort()))
    setHolidayInput('')
  }

  const removeHoliday = (d: string) => setHolidays((prev) => prev.filter((h) => h !== d))

  const canGenerate = !!startDate

  const handleGenerate = () => {
    if (!canGenerate) return
    setCalendar({
      startDate,
      offWeekdays: [...offWeekdays].sort((a, b) => a - b),
      holidays,
    })
    onClose()
  }

  const inputCls =
    'px-3 py-2 rounded-[8px] bg-surface text-primary text-[13px] outline-none border border-[var(--border)]'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-bd">
          <p className="flex-1 text-[15px] font-bold text-primary leading-snug">Generate dates</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mt-1 -mr-1 h-7 w-7 inline-flex items-center justify-center rounded-[7px] text-muted hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer border-none bg-transparent"
          >
            <HiOutlineXMark className="text-[16px]" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">
              Start date
            </label>
            <input
              type="date"
              className={inputCls}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-[11px] text-muted">
              The first training day. Dates fill forward over available days only.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">
              Days off each week
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w) => {
                const off = offWeekdays.has(w.n)
                return (
                  <button
                    key={w.n}
                    type="button"
                    onClick={() => toggleWeekday(w.n)}
                    className={`px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold border cursor-pointer transition-colors ${
                      off
                        ? 'bg-accent-light text-accent border-[var(--accent)]'
                        : 'bg-surface-2 text-secondary border-[var(--border)] hover:text-primary'
                    }`}
                    aria-pressed={off}
                  >
                    {w.label}
                  </button>
                )
              })}
            </div>
            <span className="text-[11px] text-muted">Highlighted days are skipped.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted">
              Holidays
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className={`${inputCls} flex-1`}
                value={holidayInput}
                onChange={(e) => setHolidayInput(e.target.value)}
              />
              <button
                type="button"
                onClick={addHoliday}
                disabled={!holidayInput}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-[8px] bg-accent-light text-accent text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <HiOutlinePlus className="text-[13px]" />
                Add
              </button>
            </div>
            {holidays.length > 0 && (
              <ul className="flex flex-col gap-1 mt-1">
                {holidays.map((h) => (
                  <li
                    key={h}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-[8px] bg-surface-2 border border-[var(--border)] text-[12px] text-primary"
                  >
                    <span>{h}</span>
                    <button
                      type="button"
                      onClick={() => removeHoliday(h)}
                      aria-label={`Remove ${h}`}
                      className="h-6 w-6 inline-flex items-center justify-center rounded-[6px] text-muted hover:text-[#DC2626] cursor-pointer border-none bg-transparent"
                    >
                      <HiOutlineTrash className="text-[13px]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <span className="text-[11px] text-muted">Specific dates to skip (e.g. public holidays).</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 bg-surface-2 border-t border-bd">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed font-sans"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}
