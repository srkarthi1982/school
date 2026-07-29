import { useEffect, type ReactNode } from 'react'
import { HiOutlineExclamationCircle, HiOutlineXMark } from 'react-icons/hi2'

interface Props {
  open: boolean
  title: string
  // Body copy — string or rich content.
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  // 'danger' tints the confirm button red (destructive actions).
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Design-system confirmation dialog — a styled replacement for window.confirm.
 * Backdrop click, the ✕ button and the Escape key all resolve to onCancel.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  const confirmClass =
    tone === 'danger'
      ? 'text-white bg-[#DC2626] hover:opacity-90'
      : 'text-white bg-accent hover:opacity-90'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-bd">
          <span className="mt-0.5 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-light text-accent">
            <HiOutlineExclamationCircle className="text-[18px]" />
          </span>
          <p className="flex-1 text-[15px] font-bold text-primary leading-snug">{title}</p>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="shrink-0 -mt-1 -mr-1 h-7 w-7 inline-flex items-center justify-center rounded-[7px] text-muted hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer border-none bg-transparent"
          >
            <HiOutlineXMark className="text-[16px]" />
          </button>
        </div>

        {message != null && (
          <div className="px-6 py-4 text-[13px] text-secondary leading-relaxed">{message}</div>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 bg-surface-2 border-t border-bd">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`px-4 py-2 rounded-[9px] text-sm font-semibold border-none cursor-pointer font-sans transition-opacity ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
