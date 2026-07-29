import {useEffect, useState} from 'react'
import {HiOutlineXMark} from 'react-icons/hi2'
import {useI18n} from '../../../infra/locales/I18nContext'
import {useItSupportStore} from './store'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export default function NewTicketModal({ open, onClose, onCreated }: Props) {
  const {t} = useI18n()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const createTicket = useItSupportStore((s) => s.createTicket)

  useEffect(() => {
    if (open) {
      setTitle('')
      setDescription('')
      setSubmitting(false)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const canSubmit = title.trim() && description.trim() && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await createTicket(title.trim(), description.trim())
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('itSupport.error.createFailed'))
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col max-h-[85vh]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-[15px] font-bold text-primary">{t('itSupport.newTicket')}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:bg-[var(--surface-2)] bg-transparent border-none cursor-pointer" aria-label={t('itSupport.close')}>
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3 overflow-y-auto thin-scrollbar-light">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-muted uppercase tracking-wider">{t('itSupport.field.title')}</span>
            <input
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('itSupport.field.titlePlaceholder')}
              autoFocus
              className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
              style={{ borderColor: 'var(--border)' }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-muted uppercase tracking-wider">{t('itSupport.field.description')}</span>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('itSupport.field.descriptionPlaceholder')}
              className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] resize-none"
              style={{ borderColor: 'var(--border)' }}
            />
          </label>

          <p className="text-[12px] text-muted">{t('itSupport.poolHint')}</p>

          {error && <p className="text-[12px] text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer bg-transparent border border-[var(--border)]"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {submitting ? t('itSupport.creating') : t('itSupport.createTicket')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
