import type { ReactNode } from 'react'
import { HiOutlineArrowLeft, HiOutlineCalendarDays, HiOutlineClock } from 'react-icons/hi2'
import Breadcrumb, { type Crumb } from './Breadcrumb'

interface Props {
  courseTitle: string
  courseDate: string | null
  placed: number
  total: number
  periodsPerDay: number
  periodMinutes: number
  onBack: () => void
  // Breadcrumb crumbs rendered above the title/badge (scope › course › category).
  crumbs?: Crumb[]
  // Label for the back button ("Back to Course Builder" / "Back to Course Selection").
  backLabel?: string
  // Extra controls rendered next to the periods pill (e.g. lesson search).
  children?: ReactNode
}

export default function ScheduleHeader({
  courseTitle,
  courseDate,
  placed,
  total,
  periodsPerDay,
  periodMinutes,
  onBack,
  crumbs,
  backLabel = 'Back to Course Builder',
  children,
}: Props) {
  const pct = total === 0 ? 0 : Math.round((placed / total) * 100)

  return (
    <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] bg-[var(--surface)]">
      {crumbs && <Breadcrumb className="mb-2" items={crumbs} />}

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-3 bg-transparent border-none cursor-pointer p-0"
      >
        <HiOutlineArrowLeft className="text-[14px]" />
        {backLabel}
      </button>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em]">
            <HiOutlineCalendarDays className="text-[12px]" />
            Schedule
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-primary leading-tight">{courseTitle}</h1>
            <p className="text-[12px] text-muted">
              {courseDate ? `Course Date: ${courseDate}` : 'No course date set'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {children}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-2)] text-secondary text-[11px] font-semibold border border-[var(--border)]">
            <HiOutlineClock className="text-[13px] text-muted" />
            {periodsPerDay} periods/day · {periodMinutes} min/period
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <span className="text-[11px] font-bold text-muted tracking-[0.06em] uppercase shrink-0">
          Schedule Progress
        </span>
        <div className="flex-1 progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11.5px] font-bold text-accent shrink-0">{pct}%</span>
        <span className="text-[11px] text-muted shrink-0">
          {placed}/{total} placed
        </span>
      </div>
    </div>
  )
}
