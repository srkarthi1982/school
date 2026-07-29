import {useEffect, useMemo, useState} from 'react'
import {HiOutlineCheck, HiOutlineExclamationCircle, HiOutlineMagnifyingGlass} from 'react-icons/hi2'
import {getGeneralInformation} from '../course-info/api'
import type {CourseMasterRecord, CourseRecord} from '../_shared/types'
import type {CourseInstancePayload} from './store'

interface Props {
  // null → create mode; record → edit mode (master is fixed after creation).
  record: CourseRecord | null
  masters: CourseMasterRecord[]
  // When true, all fields are disabled and the submit button is hidden — the
  // modal becomes a read-only viewer (e.g. an approved course instance).
  readOnly?: boolean
  onSubmit: (payload: CourseInstancePayload) => Promise<void>
  onClose: () => void
}

// Masters can share a title across CTP versions, so every place a master (or a
// title derived from one) is shown carries the CTP version to disambiguate.
const masterLabel = (m: CourseMasterRecord) =>
  m.ctp_version ? `${m.title} (CTP ${m.ctp_version})` : m.title

const isApproved = (m: CourseMasterRecord) => m.status.toLowerCase() === 'approved'

// Add a number of calendar days to a YYYY-MM-DD string, returning YYYY-MM-DD.
// Built from the date parts (not Date.parse + toISOString) so the result never
// drifts a day across the user's timezone.
const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export default function CourseInstanceModal({record, masters, readOnly = false, onSubmit, onClose}: Props) {
  const isEdit = record != null
  const [masterId, setMasterId] = useState<string>(record ? String(record.master_id) : '')
  const [masterSearch, setMasterSearch] = useState('')
  const [title, setTitle] = useState(record?.title ?? '')
  const [startDate, setStartDate] = useState(record?.start_date ?? '')
  const [endDate, setEndDate] = useState(record?.end_date ?? '')
  const [status, setStatus] = useState(record?.status ?? 'draft')
  // Tracks whether the user typed a title themselves; until then, picking a
  // master prefills the title from the master's.
  const [titleTouched, setTitleTouched] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Course Duration (training days) read off the selected master's Course
  // Information → General Information. Drives the End Date auto-fill + bounds.
  const [courseDuration, setCourseDuration] = useState<number | null>(null)

  useEffect(() => {
    if (isEdit || titleTouched || !masterId) return
    const m = masters.find((x) => String(x.id) === masterId)
    if (m) setTitle(masterLabel(m))
  }, [masterId, masters, isEdit, titleTouched])

  // Pull the training-day count for the chosen master. Reset while none is
  // selected so stale durations don't bound the date inputs.
  useEffect(() => {
    if (!masterId) {
      setCourseDuration(null)
      return
    }
    let cancelled = false
    getGeneralInformation(Number(masterId))
      .then((res) => {
        if (cancelled) return
        const raw = res?.data?.data?.courseDuration
        const n = raw == null || raw === '' ? NaN : Number(raw)
        setCourseDuration(Number.isFinite(n) && n > 0 ? n : null)
      })
      .catch(() => {
        if (!cancelled) setCourseDuration(null)
      })
    return () => {
      cancelled = true
    }
  }, [masterId])

  // Auto-populate End Date = Start Date + Course Duration whenever the start
  // date (or the resolved duration) changes. Create mode only — editing an
  // existing course must not silently rewrite its saved End Date.
  useEffect(() => {
    if (isEdit || courseDuration == null || !startDate) return
    setEndDate(addDays(startDate, courseDuration))
  }, [startDate, courseDuration, isEdit])

  // Allowed End Date window: [Start + Duration, Start + Duration + 7 days].
  const endMin =
    startDate && courseDuration != null ? addDays(startDate, courseDuration) : startDate || undefined
  const endMax =
    startDate && courseDuration != null ? addDays(startDate, courseDuration + 7) : undefined

  const endDateError = (() => {
    if (!startDate || !endDate) return null
    if (endDate < startDate) return 'End Date cannot be before Start Date.'
    if (courseDuration != null) {
      if (endMin && endDate < endMin)
        return `End Date cannot be before ${endMin} (Start Date + ${courseDuration} training days).`
      if (endMax && endDate > endMax)
        return `End Date cannot be after ${endMax} (Start Date + ${courseDuration} training days + 7 days).`
    }
    return null
  })()

  // All masters are shown so users can see what's coming, but non-approved ones
  // are greyed out and unselectable. Approved masters sort first.
  const filteredMasters = useMemo(() => {
    const q = masterSearch.trim().toLowerCase()
    const matches = q ? masters.filter((m) => masterLabel(m).toLowerCase().includes(q)) : masters
    return [...matches].sort((a, b) => Number(isApproved(b)) - Number(isApproved(a)))
  }, [masters, masterSearch])

  const inputClass =
    'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20' +
    (readOnly ? ' opacity-60 cursor-not-allowed' : '')

  const canSubmit =
    title.trim().length > 0 &&
    startDate.length > 0 &&
    endDate.length > 0 &&
    !endDateError &&
    (isEdit || masterId.length > 0) &&
    !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (readOnly || !canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
        status,
        ...(isEdit ? {} : {master_id: Number(masterId)}),
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
          <p className="text-base font-bold text-primary">
            {readOnly ? 'Course' : isEdit ? 'Edit Course' : 'New Course'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Course Master <span className="text-red-500">*</span>
            </label>
            {isEdit ? (
              <input
                type="text"
                value={(() => {
                  const m = masters.find((x) => x.id === record!.master_id)
                  return m ? masterLabel(m) : `Master #${record!.master_id}`
                })()}
                disabled
                className={`${inputClass} opacity-60 cursor-not-allowed`}
              />
            ) : (
              <>
                <div className="relative mb-2">
                  <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[15px]" />
                  <input
                    type="text"
                    value={masterSearch}
                    onChange={(e) => setMasterSearch(e.target.value)}
                    placeholder="Search by title…"
                    autoFocus
                    className={`${inputClass} pl-9`}
                  />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-bd divide-y divide-bd">
                  {filteredMasters.length === 0 && (
                    <p className="px-3 py-3 text-sm text-muted text-center">
                      No course masters{masterSearch.trim() ? ' match your search' : ' available'}.
                    </p>
                  )}
                  {filteredMasters.map((m) => {
                    const approved = isApproved(m)
                    const selected = String(m.id) === masterId
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => approved && setMasterId(String(m.id))}
                        disabled={!approved}
                        title={approved ? undefined : 'This course master is not approved yet'}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-start text-sm transition-colors ${
                          !approved
                            ? 'text-muted opacity-50 cursor-not-allowed'
                            : selected
                              ? 'bg-accent/10 text-primary cursor-pointer'
                              : 'text-secondary hover:bg-surface-2 cursor-pointer'
                        }`}
                      >
                        <span className="truncate">{masterLabel(m)}</span>
                        {selected && approved && (
                          <HiOutlineCheck className="text-accent text-[15px] shrink-0" />
                        )}
                        {!approved && (
                          <span className="text-[11px] uppercase tracking-wide shrink-0">Not approved</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Course Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
              placeholder="e.g. Basic CTP 2026 — Intake 1"
              required
              disabled={readOnly}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              disabled={readOnly}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              End Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={endMin}
              max={endMax}
              required
              disabled={readOnly}
              className={inputClass}
            />
            {endDateError && <p className="mt-1 text-xs text-red-500">{endDateError}</p>}
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={readOnly} className={inputClass}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          )}

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
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving…' : isEdit ? 'Save' : 'Create'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
