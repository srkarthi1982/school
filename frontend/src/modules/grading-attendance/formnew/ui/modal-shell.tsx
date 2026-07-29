import { HiOutlineXMark } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'

interface ModalShellProps {
  title: string
  hint: string
  onClose: () => void
  children: React.ReactNode
}

export function ModalShell({ title, hint, onClose, children }: ModalShellProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,27,42,0.55)' }}
      
    >
      <div
        className="card w-full max-w-[560px] max-h-[95vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-bd flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-primary tracking-[-0.01em]">{title}</h3>
            <p className="text-[12px] text-muted mt-0.5">{hint}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-surface-2 text-muted border-none bg-transparent cursor-pointer"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>
        <div style={{overflow:'auto'}}>{children}</div>
      </div>
    </div>
  )
}

interface ModalFooterProps {
  onClose: () => void
  submitLabel: string
}

export function ModalFooter({ onClose, submitLabel }: ModalFooterProps) {
  const { t } = useI18n()
  return (
    <div className="flex gap-2 justify-end border-t border-bd pt-4 mt-2">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-[10px] border border-bd bg-transparent text-primary text-[13px] font-semibold cursor-pointer hover:bg-surface-2 transition-colors"
      >
        {t('common.cancel')}
      </button>
      <button
        type="submit"
        className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-semibold cursor-pointer hover:opacity-90 transition-opacity border-none"
      >
        {submitLabel}
      </button>
    </div>
  )
}

interface FieldProps {
  label: string
  children: React.ReactNode,
  width?: string
}

export function Field({ label, children, width }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5" style={{width:width}}>
      <span className="text-[12px] font-semibold text-secondary">{label}</span>
      {children}
    </label>
  )
}