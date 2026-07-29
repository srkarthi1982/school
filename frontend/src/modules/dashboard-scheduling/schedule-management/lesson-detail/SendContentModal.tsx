import { useMemo, useState } from 'react'
import {
  HiOutlineXMark,
  HiOutlineCheckCircle,
  HiOutlineMagnifyingGlass,
  HiOutlinePaperAirplane,
  HiOutlineArrowPath,
  HiOutlineLockClosed,
} from 'react-icons/hi2'
import { setReleaseTargets, type LessonContentType, type LessonTrackStudent, type ScheduleLessonDetail } from './api'
import useToastStore from '../../../../infra/shared/store/useToastStore'
import { extractErrorMessage } from '../../../../infra/shared/utils/apiError'

// The content item a teacher is sending. Held in the page's modal state; when
// null the modal is closed.
export interface SendTarget {
  kind: LessonContentType
  contentId: number
  label: string
  // Students it's currently released to, and those who've already taken it (the
  // latter are locked on — they can't be unsent).
  releasedStudentIds: number[]
  completedStudentIds: number[]
}

function Checkbox({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center w-[20px] h-[20px] rounded-md border transition-colors ${
        checked
          ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
          : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-muted)]'
      } ${disabled ? 'opacity-70' : ''}`}
    >
      {checked && <HiOutlineCheckCircle className="text-[13px]" />}
    </span>
  )
}

export default function SendContentModal({
  courseInstanceId,
  lessonId,
  target,
  students,
  onClose,
  onDone,
}: {
  courseInstanceId: number
  lessonId: number
  target: SendTarget
  students: LessonTrackStudent[]
  onClose: () => void
  onDone: (updated: ScheduleLessonDetail) => void
}) {
  const completedSet = useMemo(() => new Set(target.completedStudentIds), [target.completedStudentIds])
  // Completed students are always selected (locked). A fresh send (nobody
  // released yet) defaults to all enrolled — the common "send to all" case —
  // which the teacher can then narrow down.
  const [selected, setSelected] = useState<Set<number>>(() => {
    if (target.releasedStudentIds.length === 0 && completedSet.size === 0) {
      return new Set(students.map((s) => s.studentId))
    }
    return new Set([...target.releasedStudentIds, ...target.completedStudentIds])
  })
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => s.fullName.toLowerCase().includes(q))
  }, [students, search])

  const toggle = (id: number) => {
    if (completedSet.has(id)) return // locked: already taken, can't unsend
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(students.map((s) => s.studentId)))
  // Clear keeps completed students selected (they can't be unsent).
  const clearAll = () => setSelected(new Set(completedSet))

  const selectedCount = selected.size
  const allSelected = selectedCount === students.length && students.length > 0

  const onSave = async () => {
    setSaving(true)
    try {
      const updated = await setReleaseTargets(
        courseInstanceId,
        lessonId,
        target.kind,
        target.contentId,
        Array.from(selected),
      )
      onDone(updated)
      useToastStore.getState().push({
        variant: 'success',
        title:
          selectedCount === 0
            ? 'Unsent from all students'
            : `Sent to ${selectedCount} student${selectedCount === 1 ? '' : 's'}`,
      })
      onClose()
    } catch (e) {
      useToastStore.getState().push({ variant: 'error', title: extractErrorMessage(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={saving ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] rounded-[14px] shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div
          className="px-6 py-4 flex items-start justify-between gap-3"
          style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
        >
          <div className="min-w-0">
            <p className="text-white/70 text-[10.5px] font-bold uppercase tracking-[0.06em]">
              Send {target.kind} to students
            </p>
            <h2 className="text-white text-[16px] font-bold truncate">{target.label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-white/70 hover:text-white transition-colors p-1 disabled:opacity-50"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[20px]" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="shrink-0 px-4 pt-3 pb-2 flex items-center gap-2 border-b border-[var(--border)]">
          <div className="flex-1 relative">
            <HiOutlineMagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students…"
              className="w-full h-8 pl-8 pr-3 rounded-[8px] bg-[var(--surface-2)] text-[var(--text-primary)] text-[12px] outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-muted)]"
            />
          </div>
          <button
            type="button"
            onClick={allSelected ? clearAll : selectAll}
            className="shrink-0 text-[11.5px] font-semibold text-[var(--accent)] bg-[var(--accent-light)] rounded-[8px] px-3 py-1.5 hover:opacity-90 transition-opacity"
          >
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
        </div>

        {/* Roster */}
        <div className="overflow-y-auto thin-scrollbar-light p-3 flex flex-col gap-1 min-h-[140px]">
          {students.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-muted)] italic px-1 py-6 text-center">
              No students are enrolled in this course.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-muted)] italic px-1 py-6 text-center">
              No students match “{search}”.
            </p>
          ) : (
            filtered.map((s) => {
              const locked = completedSet.has(s.studentId)
              const checked = selected.has(s.studentId)
              return (
                <button
                  key={s.studentId}
                  type="button"
                  onClick={() => toggle(s.studentId)}
                  disabled={locked}
                  title={locked ? 'Already taken — cannot be unsent' : undefined}
                  className={`text-start flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 transition-colors ${
                    locked
                      ? 'border-[var(--border)] bg-[var(--surface-2)] cursor-not-allowed'
                      : 'border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)] cursor-pointer'
                  }`}
                >
                  <Checkbox checked={checked} disabled={locked} />
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                      {s.fullName}
                      {s.rank ? <span className="text-[var(--text-muted)] font-medium"> · {s.rank}</span> : null}
                    </span>
                  </div>
                  {locked && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10.5px] font-bold text-[#15803d] bg-[#15803d1a] rounded-full px-2 py-0.5">
                      <HiOutlineLockClosed className="text-[11px]" /> Taken
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-4 py-3 flex items-center justify-between gap-2 bg-[var(--surface-2)]">
          <span className="text-[12px] font-semibold text-[var(--text-muted)] tabular-nums">
            {selectedCount} of {students.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-[13px] font-semibold text-[var(--text-secondary)] rounded-[10px] px-4 py-2 hover:bg-[var(--surface)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 bg-[var(--accent)] text-white text-[13px] font-semibold rounded-[10px] px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {saving ? (
                <HiOutlineArrowPath className="text-[15px] animate-spin" />
              ) : (
                <HiOutlinePaperAirplane className="text-[15px]" />
              )}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
