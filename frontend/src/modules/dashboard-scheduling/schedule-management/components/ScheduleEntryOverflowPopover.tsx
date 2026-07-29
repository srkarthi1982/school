import { useEffect, useRef } from 'react'
import type { Course, ScheduleEntry } from '../types'
import { importancePalette } from './ImportanceBadge'
import { formatTime } from '../utils/timeUtils'
import { useI18n } from '../../../../infra/locales/I18nContext'

interface Props {
  entries: ScheduleEntry[]
  courseById?: Map<number, Course>
  onPick: (entryId: number) => void
  onClose: () => void
}

export default function ScheduleEntryOverflowPopover({ entries, courseById, onPick, onClose }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute z-40 mt-1 w-[240px] max-h-[320px] overflow-y-auto thin-scrollbar-light rounded-[10px] bg-[var(--surface)] border border-[var(--border)] shadow-lg p-1.5"
    >
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        {t('schedule.moreEntries').replace('{count}', String(entries.length))}
      </div>
      <ul className="flex flex-col gap-1">
        {entries.map(entry => {
          const palette = importancePalette(entry.importance)
          const course = entry.course_id != null ? courseById?.get(entry.course_id) : undefined
          const summary = course
            ? `${course.code} — ${entry.title}`
            : entry.title
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onPick(entry.id)}
                className="w-full text-start rounded-[7px] px-2 py-1.5 hover:bg-[var(--surface-2)] transition-colors flex items-start gap-2"
                style={{ borderInlineStart: `3px solid ${palette.stripe}` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{summary}</div>
                  <div className="text-[10px] text-[var(--text-muted)] tabular-nums">
                    {formatTime(new Date(entry.startAt))}–{formatTime(new Date(entry.endAt))}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
