import {useMemo, useState} from 'react'
import {HiOutlineCalendarDays, HiOutlineExclamationCircle} from 'react-icons/hi2'
import type {CourseRecord} from '../_shared/types'

interface Props {
  record: CourseRecord
  onSubmit: (additionalDays: number) => Promise<void>
  onClose: () => void
}

// Add a number of calendar days to a YYYY-MM-DD string, returning YYYY-MM-DD.
// Built from the date parts (not Date.parse + toISOString) so the result never
// drifts a day across the user's timezone.
const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

// Inclusive day count between two YYYY-MM-DD strings.
const daysBetween = (start: string, end: string): number => {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const ms = new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime()
  return Math.round(ms / 86_400_000) + 1
}

export default function ExtendPeriodModal({record, onSubmit, onClose}: Props) {
  const [daysInput, setDaysInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mirror of the backend cap: cumulative extensions ≤ 20% (floored) of the
  // ORIGINAL period — the period as approved, before any extension. Days the
  // course spent stopped also pushed end_date out, so exclude them too.
  const {originalDays, maxExtension, remaining} = useMemo(() => {
    if (!record.start_date || !record.end_date)
      return {originalDays: 0, maxExtension: 0, remaining: 0}
    const extended = record.extended_days ?? 0
    const stopped = record.stopped_days ?? 0
    const originalDays =
      daysBetween(record.start_date, record.end_date) - extended - stopped
    const maxExtension = Math.floor(originalDays * 0.2)
    return {originalDays, maxExtension, remaining: Math.max(0, maxExtension - extended)}
  }, [record])

  const days = Number(daysInput)
  const validDays = Number.isInteger(days) && days >= 1 && days <= remaining
  const newEndDate =
    record.end_date && validDays ? addDays(record.end_date, days) : null

  const inputError =
    daysInput !== '' && !validDays
      ? !Number.isInteger(days) || days < 1
        ? 'Enter a whole number of days (1 or more).'
        : `At most ${remaining} additional day${remaining === 1 ? '' : 's'} can be added.`
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validDays || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(days)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to extend the course period')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-bd">
          <p className="text-base font-bold text-primary">Extend Course Period</p>
          <p className="text-sm text-secondary mt-0.5">{record.title}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="rounded-lg border border-bd bg-surface-2 px-4 py-3 flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-secondary">Current period</span>
              <span className="font-semibold text-primary">
                {record.start_date} → {record.end_date}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-secondary">Original duration</span>
              <span className="font-semibold text-primary">
                {originalDays} day{originalDays === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-secondary">Extension allowance (20%)</span>
              <span className="font-semibold text-primary">
                {maxExtension} day{maxExtension === 1 ? '' : 's'}
                {(record.extended_days ?? 0) > 0 && ` (${record.extended_days} used)`}
              </span>
            </div>
          </div>

          {remaining <= 0 ? (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <HiOutlineExclamationCircle className="text-amber-500 text-[15px] mt-px shrink-0" />
              <p className="text-sm text-secondary">
                {maxExtension <= 0
                  ? 'This course is too short to be extended — 20% of its period is less than one day.'
                  : 'The extension allowance for this course has been fully used.'}
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Additional days <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={remaining}
                step={1}
                value={daysInput}
                onChange={(e) => setDaysInput(e.target.value)}
                placeholder={`1 – ${remaining}`}
                autoFocus
                required
                className={inputClass}
              />
              {inputError && <p className="mt-1 text-xs text-red-500">{inputError}</p>}
              {newEndDate && (
                <p className="mt-1.5 text-xs text-secondary inline-flex items-center gap-1">
                  <HiOutlineCalendarDays className="text-[13px]" />
                  New end date: <span className="font-semibold text-primary">{newEndDate}</span>
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
            >
              {remaining <= 0 ? 'Close' : 'Cancel'}
            </button>
            {remaining > 0 && (
              <button
                type="submit"
                disabled={!validDays || submitting}
                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Extending…' : 'Extend'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
