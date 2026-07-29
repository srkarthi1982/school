import { HiOutlineCheckCircle, HiOutlineExclamationTriangle } from 'react-icons/hi2'
import AutoSaveIndicator from '../course-info/editor/AutoSaveIndicator'

interface Props {
  lastSavedAt: Date | null
  complete: boolean
  // Instance schedules must have real calendar dates generated before they can
  // be marked complete; blocks the action and shows a hint when not yet done.
  needsDates?: boolean
  onBack: () => void
  onMarkComplete: () => void
}

export default function ScheduleFooter({
  lastSavedAt,
  complete,
  needsDates = false,
  onBack,
  onMarkComplete,
}: Props) {
  const blocked = needsDates && !complete

  return (
    <div className="flex items-center justify-between gap-3 px-4 h-16 border-t border-[var(--border)] bg-[var(--surface)] shadow-[0_-1px_0_var(--border)]">
      <div className="min-w-0">
        <AutoSaveIndicator lastAutoSavedAt={lastSavedAt} />
      </div>

      <div className="flex items-center gap-2">
        {blocked && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#B45309]">
            <HiOutlineExclamationTriangle className="text-[14px] shrink-0" />
            Generate dates before marking complete
          </span>
        )}
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-1.5 rounded-[8px] bg-transparent text-secondary text-[13px] font-semibold border border-[var(--border)] cursor-pointer hover:text-primary transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onMarkComplete}
          disabled={complete || blocked}
          title={
            blocked ? 'Generate dates first to mark the schedule complete' : undefined
          }
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[8px] text-[13px] font-semibold border-none transition-opacity ${
            complete
              ? 'bg-[rgba(34,197,94,0.12)] text-[#16A34A] cursor-default'
              : blocked
                ? 'bg-accent text-white opacity-40 cursor-not-allowed'
                : 'bg-accent text-white cursor-pointer hover:opacity-90'
          }`}
        >
          <HiOutlineCheckCircle className="text-[15px]" />
          {complete ? 'Completed' : 'Mark Complete'}
        </button>
      </div>
    </div>
  )
}
