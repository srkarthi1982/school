import {ReactNode, useEffect, useMemo, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineCog6Tooth,
  HiOutlineDocumentText,
  HiOutlineDocumentDuplicate,
  HiOutlineExclamationCircle,
  HiOutlineFunnel,
  HiOutlinePauseCircle,
  HiOutlinePencilSquare,
  HiOutlinePlayCircle,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXCircle,
} from 'react-icons/hi2'
import type {CategoryDef, CourseEntity} from './types'
import {CATEGORIES, completionOf} from './types'
import ModifiedBadge from './ModifiedBadge'
import ErrorBanner from '../../../infra/shared/components/ErrorBanner'

interface Props {
  // Top-left chip label.
  chipLabel: string
  // Page title and subtitle.
  title: string
  subtitle: string
  // "Add new …" button label.
  addLabel: string
  // Records loaded by the parent's store.
  records: CourseEntity[]
  // Loading flag from the store.
  loading: boolean
  // Latest error message from the store (rendered as a banner; null to hide).
  error: string | null
  onDismissError: () => void
  // Lifecycle hooks the parent supplies.
  onMount: () => void
  onDelete: (id: number) => Promise<void>
  // Open the create modal — parent controls the modal contents.
  onClickAdd: () => void
  // Optional [data-guide] anchor value for the Add button, so interactive
  // walkthroughs (see infra/guides/registry.ts) can spotlight it.
  addDataGuide?: string
  // Optional "Clone" action shown as a secondary button beside Add. When
  // provided, clicking it opens a parent-controlled clone modal.
  onClickClone?: () => void
  cloneLabel?: string
  // Per-record "Edit"/"View" handler (opens the category list / detail page).
  onClickEdit: (record: CourseEntity) => void
  // Optional per-record "Settings" handler: opens an edit modal for the
  // record's basic settings (title/date/etc). When omitted, the cog button is
  // hidden.
  onClickSettings?: (record: CourseEntity) => void
  // Optional approval toggle: when provided, draft rows get an "Approve"
  // button and approved rows a "Cancel Approve" button (before Edit).
  onToggleApprove?: (record: CourseEntity, approve: boolean) => Promise<void>
  // Optional "Extend" handler: when provided, approved rows get an "Extend"
  // button that opens a parent-controlled period-extension modal.
  onClickExtend?: (record: CourseEntity) => void
  // Optional stop/resume handlers: approved rows get a "Stop" button (put the
  // course on hold), stopped rows a "Resume" button (shift pending sessions
  // forward by the stop gap and reactivate).
  onClickStop?: (record: CourseEntity) => void
  onClickResume?: (record: CourseEntity) => void
  // Base path for the detail page; the row click navigates to `${detailBasePath}/${id}`.
  detailBasePath: string
  // Optional slot for the modal element (rendered from parent state).
  modalSlot?: ReactNode
  // Category set used for the Completion column (defaults to the master's).
  categories?: CategoryDef[]
  // Show the CTP Version column (with the same click-to-filter as Course
  // Title). Only course masters carry a CTP Version, so it's off by default.
  showCtpVersion?: boolean
  // Show the "Linked Courses" column (number of Course instances spawned from
  // each master). Only course masters carry this count, so it's off by default.
  // When a master has ≥1 linked course, cancelling its approval is blocked.
  showLinkedCount?: boolean
  // Optional: returns true when a record's content differs from the master it
  // was seeded from (Course Selection instances only). Renders a "Modified" badge
  // beside the title.
  isModified?: (record: CourseEntity) => boolean
  // Optional: custom renderer for the "Course Title" cell content.
  titleCellRender?: (record: CourseEntity) => string
}

// CTP Version only exists on course masters; instances (CourseRecord) omit it.
function ctpOf(record: CourseEntity): string {
  return 'ctp_version' in record && record.ctp_version ? record.ctp_version : ''
}

// Number of Course instances linked to a master. Only course masters carry
// this; instances return 0.
function linkedCountOf(record: CourseEntity): number {
  return 'course_count' in record ? record.course_count ?? 0 : 0
}

function completionPercent(record: CourseEntity, categories: CategoryDef[]): number {
  const total = categories.reduce((sum, c) => sum + completionOf(record, c.completionKey), 0)
  return Math.round(total / categories.length)
}

function FilterableHeader({
  label,
  active,
  onToggle,
}: {
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <th
      className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em] select-none cursor-pointer"
      onClick={onToggle}
      title="Click to filter"
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        <HiOutlineFunnel className={`text-[12px] ${active ? 'text-accent' : 'text-white/40'}`} />
      </span>
    </th>
  )
}

function StatusBadge({status}: {status: string}) {
  const lc = status.toLowerCase()
  const palette =
    lc === 'draft'
      ? {bg: 'rgba(245,158,11,0.12)', text: '#D97706'}
      : lc === 'published' || lc === 'active' || lc === 'approved'
      ? {bg: 'rgba(34,197,94,0.10)', text: '#16A34A'}
      : lc === 'stopped'
      ? {bg: 'rgba(239,68,68,0.10)', text: '#DC2626'}
      : {bg: 'rgba(100,116,139,0.10)', text: '#64748B'}
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
      style={{background: palette.bg, color: palette.text}}
    >
      {status}
    </span>
  )
}

export default function CourseListPage({
  chipLabel,
  title,
  subtitle,
  addLabel,
  records,
  loading,
  error,
  onDismissError,
  onMount,
  onDelete,
  onClickAdd,
  addDataGuide,
  onClickClone,
  cloneLabel = 'Clone',
  onClickEdit,
  onClickSettings,
  onToggleApprove,
  onClickExtend,
  onClickStop,
  onClickResume,
  detailBasePath,
  modalSlot,
  categories = CATEGORIES,
  showCtpVersion = false,
  showLinkedCount = false,
  isModified,
  titleCellRender,
}: Props) {
  const navigate = useNavigate()
  // Row whose approval toggle is in flight (disables just that button).
  const [approvingId, setApprovingId] = useState<number | null>(null)
  const [filterTitle, setFilterTitle] = useState('')
  const [filterCtp, setFilterCtp] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  // Track which column filters are currently expanded. A column's filter
  // input is hidden until the user clicks that column's header.
  const [openFilters, setOpenFilters] = useState<Set<'title' | 'ctp' | 'date' | 'status'>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<CourseEntity | null>(null)
  // Record whose Cancel-Approve was blocked because it still has linked courses.
  const [blockedCancel, setBlockedCancel] = useState<CourseEntity | null>(null)

  const toggleFilter = (key: 'title' | 'ctp' | 'date' | 'status') => {
    setOpenFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const anyFilterOpen = openFilters.size > 0

  useEffect(() => {
    onMount()
  }, [onMount])

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const titleText = titleCellRender ? titleCellRender(r) : r.title
      if (filterTitle && !titleText.toLowerCase().includes(filterTitle.toLowerCase())) return false
      if (filterCtp && !ctpOf(r).toLowerCase().includes(filterCtp.toLowerCase())) return false
      if (filterDate && r.course_date !== filterDate) return false
      if (filterStatus && r.status.toLowerCase() !== filterStatus.toLowerCase()) return false
      return true
    })
  }, [records, filterTitle, filterCtp, filterDate, filterStatus, titleCellRender])

  const inputClass =
    'w-full px-2 py-1 bg-surface-2 border border-bd rounded text-primary text-xs focus:outline-none focus:border-accent'

  const handleDelete = async (record: CourseEntity) => {
    try {
      await onDelete(record.id)
      setDeleteConfirm(null)
    } catch {
      // store.error already populated
    }
  }

  const handleToggleApprove = async (record: CourseEntity, approve: boolean) => {
    if (!onToggleApprove || approvingId !== null) return
    // Cancelling approval is blocked while the master still has linked courses.
    // Surface the reason instead of hitting the API (the backend enforces this
    // too, returning the same message).
    if (!approve && linkedCountOf(record) > 0) {
      setBlockedCancel(record)
      return
    }
    setApprovingId(record.id)
    try {
      await onToggleApprove(record, approve)
    } catch {
      // store.error already populated
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <div>
      {/* Chip */}
      <div className="mb-2">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
          style={{background: 'rgba(6,85,92,0.10)', color: 'var(--accent)'}}
        >
          <HiOutlineDocumentText className="text-[13px]" />
          {chipLabel}
        </span>
      </div>

      {/* Title + Add */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-[22px] font-bold text-primary tracking-[-0.02em]">{title}</h2>
          <p className="text-[13px] text-secondary mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onClickClone && (
            <button
              onClick={onClickClone}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
            >
              <HiOutlineDocumentDuplicate className="text-[15px]" />
              {cloneLabel}
            </button>
          )}
          <button
            onClick={onClickAdd}
            data-guide={addDataGuide}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] text-sm font-semibold text-white bg-accent hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
          >
            <HiOutlinePlus className="text-[15px]" />
            {addLabel}
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={onDismissError} />}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{background: 'var(--navy)'}}>
                <FilterableHeader
                  label="Course Title"
                  active={openFilters.has('title') || !!filterTitle}
                  onToggle={() => toggleFilter('title')}
                />
                {showCtpVersion && (
                  <FilterableHeader
                    label="CTP Version"
                    active={openFilters.has('ctp') || !!filterCtp}
                    onToggle={() => toggleFilter('ctp')}
                  />
                )}
                <FilterableHeader
                  label="Course Date"
                  active={openFilters.has('date') || !!filterDate}
                  onToggle={() => toggleFilter('date')}
                />
                <FilterableHeader
                  label="Status"
                  active={openFilters.has('status') || !!filterStatus}
                  onToggle={() => toggleFilter('status')}
                />
                {showLinkedCount && (
                  <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                    Linked Courses
                  </th>
                )}
                <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                  Completion
                </th>
                <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
                  Actions
                </th>
              </tr>
              {anyFilterOpen && (
                <tr style={{background: 'var(--navy-mid)'}}>
                  <th className="px-4 py-2">
                    {openFilters.has('title') && (
                      <input
                        type="text"
                        placeholder="Course Title"
                        value={filterTitle}
                        onChange={(e) => setFilterTitle(e.target.value)}
                        autoFocus
                        className={inputClass}
                      />
                    )}
                  </th>
                  {showCtpVersion && (
                    <th className="px-4 py-2">
                      {openFilters.has('ctp') && (
                        <input
                          type="text"
                          placeholder="CTP Version"
                          value={filterCtp}
                          onChange={(e) => setFilterCtp(e.target.value)}
                          autoFocus
                          className={inputClass}
                        />
                      )}
                    </th>
                  )}
                  <th className="px-4 py-2">
                    {openFilters.has('date') && (
                      <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        autoFocus
                        className={inputClass}
                      />
                    )}
                  </th>
                  <th className="px-4 py-2">
                    {openFilters.has('status') && (
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        autoFocus
                        className={inputClass}
                      >
                        <option value="">Status</option>
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="stopped">Stopped</option>
                        <option value="published">Published</option>
                      </select>
                    )}
                  </th>
                  {showLinkedCount && <th />}
                  <th />
                  <th />
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-bd">
              {filtered.map((r) => {
                const pct = completionPercent(r, categories)
                // Stricter than the rounded pct: every category must be done.
                const fullyComplete = categories.every(
                  (c) => completionOf(r, c.completionKey) >= 100,
                )
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-surface-2 transition-colors duration-100 cursor-pointer"
                    onClick={() => navigate(`${detailBasePath}/${r.id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-semibold text-primary">
                      <span className="inline-flex items-center gap-2">
                        {titleCellRender ? titleCellRender(r) : r.title}
                        {isModified?.(r) && <ModifiedBadge />}
                      </span>
                    </td>
                    {showCtpVersion && (
                      <td className="px-4 py-3 text-sm text-secondary">{ctpOf(r) || '—'}</td>
                    )}
                    <td className="px-4 py-3 text-sm text-secondary">{r.course_date || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    {showLinkedCount && (
                      <td className="px-4 py-3 text-sm text-secondary">
                        {linkedCountOf(r)}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden min-w-[80px]">
                          <div
                            className="h-full bg-accent transition-[width]"
                            style={{width: `${pct}%`}}
                          />
                        </div>
                        <span className="text-[11px] text-muted shrink-0">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {onClickSettings && (
                          <button
                            title="Settings"
                            onClick={() => onClickSettings(r)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-[7px] bg-surface-2 border border-bd text-muted hover:text-primary cursor-pointer"
                          >
                            <HiOutlineCog6Tooth className="text-[14px]" />
                          </button>
                        )}
                        {onToggleApprove && r.status.toLowerCase() === 'draft' && (
                          <button
                            onClick={() => handleToggleApprove(r, true)}
                            disabled={approvingId !== null || !fullyComplete}
                            title={!fullyComplete ? 'All categories must be 100% complete before approval' : undefined}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-green-600 text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <HiOutlineCheckCircle className="text-[13px]" />
                            {approvingId === r.id ? 'Approving…' : 'Approve'}
                          </button>
                        )}
                        {onToggleApprove && r.status.toLowerCase() === 'approved' && (
                          <button
                            onClick={() => handleToggleApprove(r, false)}
                            disabled={approvingId !== null}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <HiOutlineXCircle className="text-[13px]" />
                            {approvingId === r.id ? 'Cancelling…' : 'Cancel Approve'}
                          </button>
                        )}
                        {onClickExtend && r.status.toLowerCase() === 'approved' && (
                          <button
                            onClick={() => onClickExtend(r)}
                            title="Extend the course period"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-blue-600 text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                          >
                            <HiOutlineCalendarDays className="text-[13px]" />
                            Extend
                          </button>
                        )}
                        {onClickStop && r.status.toLowerCase() === 'approved' && (
                          <button
                            onClick={() => onClickStop(r)}
                            title="Temporarily stop the course — all activities go on hold"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-orange-500 text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                          >
                            <HiOutlinePauseCircle className="text-[13px]" />
                            Stop
                          </button>
                        )}
                        {onClickResume && r.status.toLowerCase() === 'stopped' && (
                          <button
                            onClick={() => onClickResume(r)}
                            title="Resume the course — pending sessions shift forward by the stop gap"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-green-600 text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                          >
                            <HiOutlinePlayCircle className="text-[13px]" />
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() => onClickEdit(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
                        >
                          <HiOutlinePencilSquare className="text-[13px]" />
                          {['approved', 'stopped'].includes(r.status.toLowerCase()) ? 'View' : 'Edit'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(r)}
                          disabled={['approved', 'stopped'].includes(r.status.toLowerCase())}
                          title={
                            r.status.toLowerCase() === 'approved'
                              ? 'Approved courses cannot be deleted. Cancel approval first.'
                              : r.status.toLowerCase() === 'stopped'
                              ? 'Stopped courses cannot be deleted. Resume the course first.'
                              : undefined
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-red-500 text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <HiOutlineTrash className="text-[13px]" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5 + (showCtpVersion ? 1 : 0) + (showLinkedCount ? 1 : 0)} className="text-center py-12 text-muted text-sm">
                    No records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalSlot}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-500/10">
                <HiOutlineExclamationCircle className="text-red-500 text-xl" />
              </div>
              <div>
                <p className="text-base font-bold text-primary">Confirm delete</p>
                <p className="text-sm text-secondary mt-1">
                  <strong>{deleteConfirm.title}</strong> will be permanently removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={loading}
                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-white bg-red-500 hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50"
              >
                {loading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {blockedCancel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setBlockedCancel(null)}>
          <div
            className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-full bg-amber-500/10">
                <HiOutlineExclamationCircle className="text-amber-500 text-xl" />
              </div>
              <div>
                <p className="text-base font-bold text-primary">Cannot cancel approval</p>
                <p className="text-sm text-secondary mt-1">
                  <strong>{blockedCancel.title}</strong> has{' '}
                  <strong>{linkedCountOf(blockedCancel)}</strong> linked course
                  {linkedCountOf(blockedCancel) === 1 ? '' : 's'}. The linked course
                  {linkedCountOf(blockedCancel) === 1 ? '' : 's'} must be deleted first
                  before this course master can be modified.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setBlockedCancel(null)}
                className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
