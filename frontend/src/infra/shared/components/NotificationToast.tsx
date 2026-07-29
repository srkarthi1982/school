import { HiOutlineXMark, HiOutlineInformationCircle, HiOutlineCheckCircle, HiOutlineExclamationTriangle, HiOutlineXCircle } from 'react-icons/hi2'
import type { Toast as ToastType, ToastVariant } from '../store/useToastStore'
import { useNavigate } from 'react-router-dom'

const VARIANT_STYLES: Record<ToastVariant, { bg: string; ring: string; icon: typeof HiOutlineInformationCircle }> = {
  info:    { bg: 'bg-white',          ring: 'ring-[var(--accent)]/30',  icon: HiOutlineInformationCircle },
  success: { bg: 'bg-white',          ring: 'ring-emerald-300',         icon: HiOutlineCheckCircle },
  warning: { bg: 'bg-white',          ring: 'ring-amber-300',           icon: HiOutlineExclamationTriangle },
  error:   { bg: 'bg-white',          ring: 'ring-red-300',             icon: HiOutlineXCircle },
}

const ICON_COLOR: Record<ToastVariant, string> = {
  info: 'text-[var(--accent)]',
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
}

interface Props {
  toast: ToastType
  onClose: () => void
}

export default function Toast({ toast, onClose }: Props) {
  const styles = VARIANT_STYLES[toast.variant]
  const Icon = styles.icon
  const clickable = true;//!!toast.onClick

  const navigate = useNavigate()

  const handleClick = () => {
    if (toast.onClick) {
      toast.onClick()
    } else {
      onClose()
      navigate(`/communication-reporting/chat`)
    }
  }

  return (
    <div
      role="status"
      // onClick={clickable ? handleClick : undefined}
      onClick={handleClick}
      className={`pointer-events-auto w-80 max-w-full rounded-lg shadow-lg ring-1 ${styles.ring} ${styles.bg} p-3 flex gap-2 items-start ${clickable ? 'cursor-pointer hover:shadow-xl transition-shadow' : ''}`}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${ICON_COLOR[toast.variant]}`} />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div className="text-sm font-semibold text-[var(--text)] truncate">{toast.title}</div>
        )}
        {toast.body && (
          <div className="text-xs text-[var(--text-2)] mt-0.5 line-clamp-2">{toast.body}</div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="shrink-0 p-1 -m-1 text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
      >
        <HiOutlineXMark className="w-4 h-4" />
      </button>
    </div>
  )
}
