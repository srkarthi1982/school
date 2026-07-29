import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { HiOutlineCalendarDays, HiOutlineClock } from 'react-icons/hi2'
import 'react-day-picker/style.css'

interface Props {
  /** Local ISO string in `YYYY-MM-DDTHH:mm` format (same shape as `<input type="datetime-local">`). Empty string = no value. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  /** Minute granularity for the time field. Defaults to 15. */
  minuteStep?: number
  dateOnly?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

function parseLocal(value: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function formatLocalISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDisplayTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function DateTimePicker({ value, onChange, disabled, required, minuteStep = 15, dateOnly = false }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  // Popover lives in a portal on <body> so it escapes modal/overflow
  // clipping. We compute its position from the trigger's rect each time
  // it opens (and on viewport changes while open) so it stays anchored.
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null)

  const date = useMemo(() => parseLocal(value), [value])

  useLayoutEffect(() => {
    if (!open) {
      setPopPos(null)
      return
    }
    const updatePos = () => {
      const trigger = wrapperRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      setPopPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX })
    }
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      const insideTrigger = wrapperRef.current?.contains(target)
      const insidePopover = popoverRef.current?.contains(target)
      if (!insideTrigger && !insidePopover) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleSelectDate = (selected: Date | undefined) => {
    if (!selected) return
    const base = date ?? new Date()
    const next = new Date(selected)
    if (!dateOnly) {
      next.setHours(base.getHours(), base.getMinutes(), 0, 0)
    }

    onChange(formatLocalISO(next))
  }

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = e.target.value
    if (!time) return
    const [hh, mm] = time.split(':').map(Number)
    const base = date ?? new Date()
    const next = new Date(base)
    next.setHours(hh, mm, 0, 0)
    onChange(formatLocalISO(next))
  }

  const triggerLabel = !dateOnly ? (date
    ? `${formatDisplayDate(date)} · ${formatDisplayTime(date)}`
    : 'Pick date and time') : (date
      ? `${formatDisplayDate(date)}` : 'Pick date')

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-70"
      >
        <span className="flex items-center gap-2 min-w-0">
          <HiOutlineCalendarDays className="text-[15px] shrink-0 text-[var(--text-muted)]" />
          <span className={`truncate ${date ? '' : 'text-[var(--text-muted)]'}`}>{triggerLabel}</span>
        </span>
      </button>

      {/* Hidden input keeps native form `required` semantics. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => { }}
          className="sr-only pointer-events-none"
          style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
        />
      )}

      {open && !disabled && popPos &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            style={{ position: 'absolute', top: popPos.top, left: popPos.left, zIndex: 1000 }}
            className="rounded-[12px] border border-[var(--border)] bg-[var(--surface)] shadow-lg p-2"
          >
            <DayPicker
              mode="single"
              captionLayout='dropdown'
              selected={date ?? undefined}
              onSelect={handleSelectDate}
              showOutsideDays
              classNames={{
                today: 'rdp-today-accent',
                selected: 'rdp-selected-accent',
              }}
            />
            {!dateOnly && (
              <div className="flex items-center gap-2 px-2 pt-2 border-t border-[var(--border)]">
                <HiOutlineClock className="text-[15px] text-[var(--text-muted)]" />
                <input
                  type="time"
                  step={minuteStep * 60}
                  value={date ? formatDisplayTime(date) : ''}
                  onChange={handleTimeChange}
                  className="flex-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
