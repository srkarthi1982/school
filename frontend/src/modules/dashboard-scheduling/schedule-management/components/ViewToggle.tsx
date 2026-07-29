import { useShallow } from 'zustand/react/shallow'
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi2'
import useScheduleManagementStore, { selectCursor, selectView } from '../store'
import {
  addDays,
  addMonths,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRange,
} from '../utils/timeUtils'
import { useI18n } from '../../../../infra/locales/I18nContext'
import type { ViewMode } from '../types'

export default function ViewToggle() {
  const { t } = useI18n()
  const { view, cursor } = useScheduleManagementStore(
    useShallow(s => ({ view: selectView(s), cursor: selectCursor(s) })),
  )
  const setView = useScheduleManagementStore(s => s.setView)
  const setCursor = useScheduleManagementStore(s => s.setCursor)
  const goToday = useScheduleManagementStore(s => s.goToday)

  const cursorDate = new Date(cursor)
  const rangeLabel =
    view === 'day' ? formatDayLabel(cursorDate)
      : view === 'week' ? formatWeekRange(cursorDate)
        : formatMonthLabel(cursorDate)

  const shift = (dir: -1 | 1) => {
    const d = new Date(cursorDate)
    if (view === 'day') setCursor(addDays(d, dir).toISOString())
    else if (view === 'week') setCursor(addDays(d, 7 * dir).toISOString())
    else setCursor(addMonths(d, dir).toISOString())
  }

  const tabs: { value: ViewMode; label: string }[] = [
    { value: 'day', label: t('schedule.day') },
    { value: 'week', label: t('schedule.week') },
    { value: 'month', label: t('schedule.month') },
  ]

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] p-2 transition-colors"
          aria-label={t('schedule.previous')}
        >
          <HiOutlineChevronLeft className="text-[16px] text-[var(--text-secondary)]" />
        </button>
        <button
          type="button"
          onClick={() => goToday()}
          className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] px-3 py-2 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors"
        >
          {t('schedule.today')}
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] p-2 transition-colors"
          aria-label={t('schedule.next')}
        >
          <HiOutlineChevronRight className="text-[16px] text-[var(--text-secondary)]" />
        </button>
        <div className="ms-2 text-[15px] font-bold text-[var(--text-primary)] tracking-[-0.01em]">
          {rangeLabel}
        </div>
      </div>

      <div className="inline-flex items-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-0.5">
        {tabs.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setView(tab.value)}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-[8px] transition-colors ${view === tab.value
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
