import { useEffect, useState, type FormEvent } from 'react'
import { HiOutlineExclamationCircle } from 'react-icons/hi2'
import DateTimePicker from '../../../../infra/shared/components/DateTimePicker'
import { useI18n } from '../../../../infra/locales/I18nContext'
import { extractErrorMessage } from '../../../../infra/shared/utils/apiError'
import type { ClassSession, CreateSessionPayload } from '../types'

const inputClass =
  'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

type Props = {
  open: boolean
  editing: ClassSession | null
  onClose: () => void
  onSubmit: (payload: CreateSessionPayload, version?: number) => Promise<void>
}

function toLocalInputValue(iso: string): string {
  // Convert ISO to "YYYY-MM-DDTHH:mm" format the datetime-local input expects.
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultStartISO(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.toISOString()
}

function defaultEndISO(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 2)
  return d.toISOString()
}

export default function SessionFormModal({ open, editing, onClose, onSubmit }: Props) {
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledStart, setScheduledStart] = useState('')
  const [scheduledEnd, setScheduledEnd] = useState('')
  const [maxParticipants, setMaxParticipants] = useState(10)
  const [participantsInput, setParticipantsInput] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSubmitError(null)
    if (editing) {
      setTitle(editing.title)
      setDescription(editing.description ?? '')
      setScheduledStart(toLocalInputValue(editing.scheduled_start))
      setScheduledEnd(toLocalInputValue(editing.scheduled_end))
      setMaxParticipants(editing.max_participants)
      setParticipantsInput((editing.participant_user_ids ?? []).join(', '))
    } else {
      setTitle('')
      setDescription('')
      setScheduledStart(toLocalInputValue(defaultStartISO()))
      setScheduledEnd(toLocalInputValue(defaultEndISO()))
      setMaxParticipants(10)
      setParticipantsInput('')
    }
  }, [open, editing])

  if (!open) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    const startDate = new Date(scheduledStart)
    const endDate = new Date(scheduledEnd)
    if (endDate <= startDate) {
      setSubmitError(t('virtualClassroom.errors.invalidTimeRange'))
      return
    }
    // Parse comma/whitespace-separated user IDs. Empty input -> null = open.
    const ids = participantsInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
      setSubmitError(t('virtualClassroom.errors.invalidParticipants'))
      return
    }
    const uniqueIds = Array.from(new Set(ids))
    setSubmitting(true)
    try {
      await onSubmit(
        {
          title: title.trim(),
          description: description.trim() || null,
          scheduled_start: startDate.toISOString(),
          scheduled_end: endDate.toISOString(),
          max_participants: maxParticipants,
          participant_user_ids: uniqueIds.length ? uniqueIds : null,
        },
        editing?.version,
      )
      onClose()
    } catch (e: unknown) {
      setSubmitError(extractErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-6 py-4 shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
        >
          <p className="text-[13px] font-bold text-white">
            {editing ? t('virtualClassroom.edit') : t('virtualClassroom.create')}
          </p>
          <p className="text-[11px] text-white/50 mt-px">
            {editing ? t('common.updateRecordHint') : t('common.fillFieldsHint')}
          </p>
        </div>

        <form id="vc-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              {t('virtualClassroom.fields.title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                {t('virtualClassroom.fields.scheduledStart')}
              </label>
              <DateTimePicker
                  value={scheduledStart}
                  onChange={setScheduledStart}
                  required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                {t('virtualClassroom.fields.scheduledEnd')}
              </label>
              <DateTimePicker
                  value={scheduledEnd}
                  onChange={setScheduledEnd}
                  required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              {t('virtualClassroom.fields.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>



          <div className={"hidden"}>
            <label className="block text-sm font-medium text-secondary mb-1">
              {t('virtualClassroom.fields.maxParticipants')}
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
              required
              className={inputClass}
            />
          </div>

          <div className={"hidden"}>
            <label className="block text-sm font-medium text-secondary mb-1">
              {t('virtualClassroom.fields.participants')}
            </label>
            <textarea
              value={participantsInput}
              onChange={(e) => setParticipantsInput(e.target.value)}
              rows={2}
              placeholder="2, 3, 7"
              className={`${inputClass} resize-none font-mono text-xs`}
            />
            <p className="text-[11px] text-muted mt-1">
              {t('virtualClassroom.fields.participantsHint')}
            </p>
          </div>

          {submitError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
              <HiOutlineExclamationCircle className="text-[16px] shrink-0 mt-px" />
              <span>{submitError}</span>
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-bd bg-surface-2 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="py-2 px-4 rounded-lg text-sm font-medium text-secondary border border-bd bg-surface hover:bg-surface-2 transition-colors cursor-pointer font-sans disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="vc-form"
            disabled={submitting}
            className="py-2 px-4 rounded-lg text-sm font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50"
          >
            {editing ? t('common.save') : t('common.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
