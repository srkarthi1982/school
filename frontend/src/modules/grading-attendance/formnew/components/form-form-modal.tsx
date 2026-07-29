import { useState } from 'react'
import { HiOutlineExclamationCircle } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'

import { Field, ModalFooter, ModalShell } from '../ui/modal-shell'
import { Form } from '../types/form'
import { FaRocket, FaSave } from 'react-icons/fa'

export interface FormFormSubmit {
  title: string
  description: string
  status: string
  scheduledAt: string | null
}

interface FormFormModalProps {
  mode: 'create' | 'edit'
  initial: Form | null
  onClose: () => void
  onSubmit: (payload: FormFormSubmit) => void | Promise<void>
}

// Convert an ISO string to the value expected by <input type="datetime-local">.
const isoToLocalInput = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function FormFormModal({ mode, initial, onClose, onSubmit }: FormFormModalProps) {
  const { t } = useI18n()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [status, setStatus] = useState(initial?.status ?? 'draft')
  const [scheduledAt, setScheduledAt] = useState<string>(isoToLocalInput(initial?.scheduledAt))
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim() || !description.trim()) {
      setError(t('form.errors.required'))
      return
    }
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    })
  }

  const popupTitle = mode === 'edit' ? t('form.editForm') : t('form.createForm')
  const hint = mode === 'edit' ? t('common.updateRecordHint') : t('common.fillFieldsHint')
  const submitLabel = mode === 'edit' ? t('common.save') : t('common.create')

  return (
    <ModalShell title={popupTitle} hint={hint} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto thin-scrollbar-light max-h-[75vh]">
        <Field label={t('form.formName')}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
          />
        </Field>
        <Field label={t('form.formDescription')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent resize-none"
          />
        </Field>

        <Field label={t('form.scheduledAt')}>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full px-3 py-2 rounded-[10px] border border-bd bg-surface-2 text-primary text-[13.5px] outline-none focus:border-accent"
          />
          <p className="text-[11px] text-muted mt-1">{t('form.scheduledAtHint')}</p>
        </Field>

        {mode === 'edit' &&
          <Field label={t('form.formStatus')}>

            <div className="flex items-center gap-3 p-4  border border-bd bg-surface-2 text-primary text-[13.5px] outline-none rounded-xl">
              <input type="checkbox" checked={status === "published"} onChange={e => setStatus(e.target.checked ? 'published' : 'draft')}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500" />
              <label className="text-[12px]  text-secondary  flex items-center gap-2">
                {status === 'published' ? (
                  <>
                    <FaRocket className="w-4 h-4 text-green-500" />
                    Publish
                  </>
                ) : (
                  <>
                    <FaSave className="w-4 h-4 text-yellow-500" />
                    Save Draft
                  </>
                )}
              </label>
            </div>
          </Field>
        }
        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
            <HiOutlineExclamationCircle className="text-[16px] shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        <ModalFooter onClose={onClose} submitLabel={submitLabel} />
      </form>
    </ModalShell>
  )
}
