import {ReactNode, useState} from 'react'
import {HiOutlineExclamationCircle} from 'react-icons/hi2'
import {useI18n} from '../../../infra/locales/I18nContext'

export interface NewCourseFormValues {
  title: string
  ctp_version: string
  course_date: string | null
}

interface Props {
  // Title shown in the modal header; mockup uses "New Course Training Plan".
  heading: string
  // Submit button label; mockup uses "Create".
  submitLabel?: string
  // When provided, the form opens pre-filled (edit mode) instead of blank.
  initialValues?: NewCourseFormValues
  // When true, all fields are disabled and the submit button is hidden — the
  // modal becomes a read-only viewer (e.g. an approved Course Master).
  readOnly?: boolean
  // Optional extra fields rendered below the standard title/date (used by the
  // Courses variant to add master selector + dates + location).
  extraFields?: ReactNode
  // Whether extra fields are valid; submission stays disabled until true.
  extraFieldsValid?: boolean
  // The actual submit handler. Receives base values and is expected to read
  // extra-field state from a closure.
  onSubmit: (values: NewCourseFormValues) => Promise<void>
  onClose: () => void
}

export default function NewCourseModal({
  heading,
  submitLabel = 'Create',
  initialValues,
  readOnly = false,
  extraFields,
  extraFieldsValid = true,
  onSubmit,
  onClose,
}: Props) {
  const {t} = useI18n()
  const [title, setTitle] = useState(initialValues?.title ?? '')
  const [ctpVersion, setCtpVersion] = useState(initialValues?.ctp_version ?? '')
  const [courseDate, setCourseDate] = useState(initialValues?.course_date ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputClass =
    'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20' +
    (readOnly ? ' opacity-60 cursor-not-allowed' : '')

  const canSubmit =
    title.trim().length > 0 && ctpVersion.trim().length > 0 && extraFieldsValid && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly || !canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        ctp_version: ctpVersion.trim(),
        course_date: courseDate || null,
      })
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-bd">
          <p className="text-base font-bold text-primary">{heading}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Course Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Basic CTP 2026"
              required
              autoFocus={!readOnly}
              disabled={readOnly}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              CTP Version <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={ctpVersion}
              onChange={(e) => setCtpVersion(e.target.value)}
              placeholder="e.g. 2026 Rev A"
              required
              disabled={readOnly}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Course Date</label>
            <input
              type="date"
              value={courseDate}
              onChange={(e) => setCourseDate(e.target.value)}
              disabled={readOnly}
              className={inputClass}
            />
          </div>

          {extraFields}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
            >
              {readOnly ? t('common.close') : t('common.cancel')}
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving…' : submitLabel}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
