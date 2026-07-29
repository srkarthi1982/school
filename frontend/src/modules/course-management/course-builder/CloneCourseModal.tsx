import {useEffect, useMemo, useState} from 'react'
import {HiOutlineCheck, HiOutlineExclamationCircle, HiOutlineMagnifyingGlass} from 'react-icons/hi2'
import type {CourseMasterRecord} from '../_shared/types'

export interface CloneCourseFormValues {
  source_master_id: number
  title: string
  ctp_version: string
  course_date: string | null
}

interface Props {
  // Course masters available to clone from (the list page's loaded records).
  masters: CourseMasterRecord[]
  onSubmit: (values: CloneCourseFormValues) => Promise<void>
  onClose: () => void
}

// Masters can share a title across CTP versions, so always show the CTP
// version alongside the title to disambiguate.
const masterLabel = (m: CourseMasterRecord) =>
  m.ctp_version ? `${m.title} (CTP ${m.ctp_version})` : m.title

export default function CloneCourseModal({masters, onSubmit, onClose}: Props) {
  const [search, setSearch] = useState('')
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [ctpVersion, setCtpVersion] = useState('')
  const [courseDate, setCourseDate] = useState('')
  // Until the user edits the title themselves, selecting a source prefills it.
  const [titleTouched, setTitleTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputClass =
    'w-full px-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

  // Only approved course masters can be cloned as a source.
  const filtered = useMemo(() => {
    const approved = masters.filter((m) => m.status.toLowerCase() === 'approved')
    const q = search.trim().toLowerCase()
    if (!q) return approved
    return approved.filter((m) => m.title.toLowerCase().includes(q))
  }, [masters, search])

  // Prefill the title from the chosen source until the user overrides it.
  useEffect(() => {
    if (titleTouched || sourceId == null) return
    const m = masters.find((x) => x.id === sourceId)
    if (m) setTitle(`${m.title} (Copy)`)
  }, [sourceId, masters, titleTouched])

  const canSubmit =
    sourceId != null &&
    title.trim().length > 0 &&
    ctpVersion.trim().length > 0 &&
    !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || sourceId == null) return
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        source_master_id: sourceId,
        title: title.trim(),
        ctp_version: ctpVersion.trim(),
        course_date: courseDate || null,
      })
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to clone')
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
          <p className="text-base font-bold text-primary">Clone Course Master</p>
          <p className="text-[13px] text-secondary mt-1">
            Pick an approved course master to duplicate, then set the new title and CTP version. The
            clone starts as a draft with every category reset to 0%.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Course Master to Clone <span className="text-red-500">*</span>
            </label>
            <div className="relative mb-2">
              <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[15px]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title…"
                autoFocus
                className={`${inputClass} pl-9`}
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-bd divide-y divide-bd">
              {filtered.length === 0 && (
                <p className="px-3 py-3 text-sm text-muted text-center">
                  No approved course masters{search.trim() ? ' match your search' : ' to clone'}.
                </p>
              )}
              {filtered.map((m) => {
                const selected = m.id === sourceId
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setSourceId(m.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-start text-sm cursor-pointer transition-colors ${
                      selected ? 'bg-accent/10 text-primary' : 'text-secondary hover:bg-surface-2'
                    }`}
                  >
                    <span className="truncate">{masterLabel(m)}</span>
                    {selected && <HiOutlineCheck className="text-accent text-[15px] shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              New Course Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleTouched(true)
              }}
              placeholder="e.g. Basic CTP 2026"
              required
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
              placeholder="e.g. 2026 Rev B"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Course Date</label>
            <input
              type="date"
              value={courseDate}
              onChange={(e) => setCourseDate(e.target.value)}
              className={inputClass}
            />
          </div>

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
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Cloning…' : 'Clone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
