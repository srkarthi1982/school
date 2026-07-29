import { useMemo, useState } from 'react'
import {
  HiOutlineXMark,
  HiOutlineCheckCircle,
  HiOutlineMagnifyingGlass,
  HiOutlinePaperAirplane,
  HiOutlineArrowPath,
  HiOutlineLockClosed,
} from 'react-icons/hi2'
import useToastStore from '../store/useToastStore'
import { extractErrorMessage } from '../utils/apiError'

// A student who can receive the content (from the /eligible-takers roster).
export interface SendRecipient {
  id: number
  fullName?: string | null
  email?: string | null
  username?: string | null
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

/**
 * Generic "send this item to specific students" picker. Used by Quiz Bank, Form,
 * and Survey to hand-pick recipients — no course/lesson link involved.
 *
 * Students who have already taken/finished the item are locked ON: they stay
 * selected and can't be unsent.
 */
export default function SendToStudentsModal({
  kindLabel,
  itemTitle,
  roster,
  initialSelectedIds,
  lockedIds,
  onClose,
  onSave,
}: {
  kindLabel: string // "quiz" | "form" | "survey"
  itemTitle: string
  roster: SendRecipient[]
  initialSelectedIds: number[]
  lockedIds: number[]
  onClose: () => void
  onSave: (studentIds: number[]) => Promise<void>
}) {
  const lockedSet = useMemo(() => new Set(lockedIds), [lockedIds])
  // Completed (locked) students are always selected. On a fresh send (nobody
  // selected yet) default to selecting everyone — the common "send to all" case
  // — which the teacher can then narrow down.
  const [selected, setSelected] = useState<Set<number>>(() => {
    if (initialSelectedIds.length === 0 && lockedSet.size === 0) {
      return new Set(roster.map((s) => s.id))
    }
    return new Set([...initialSelectedIds, ...lockedIds])
  })
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const nameOf = (s: SendRecipient) => s.fullName || s.username || s.email || `#${s.id}`

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((s) => nameOf(s).toLowerCase().includes(q))
  }, [roster, search])

  const toggle = (id: number) => {
    if (lockedSet.has(id)) return // locked: already taken, can't unsend
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(roster.map((s) => s.id)))
  const clearAll = () => setSelected(new Set(lockedSet)) // locked stay selected

  const selectedCount = selected.size
  const allSelected = selectedCount === roster.length && roster.length > 0

  const onSaveClick = async () => {
    setSaving(true)
    try {
      await onSave(Array.from(selected))
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
              Send {kindLabel} to students
            </p>
            <h2 className="text-white text-[16px] font-bold truncate">{itemTitle}</h2>
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
          {roster.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-muted)] italic px-1 py-6 text-center">
              No students are available to receive this {kindLabel}.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-muted)] italic px-1 py-6 text-center">
              No students match “{search}”.
            </p>
          ) : (
            filtered.map((s) => {
              const locked = lockedSet.has(s.id)
              const checked = selected.has(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
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
                      {nameOf(s)}
                    </span>
                    {s.email && (
                      <span className="text-[11px] text-[var(--text-muted)] truncate">{s.email}</span>
                    )}
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
            {selectedCount} of {roster.length} selected
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
              onClick={onSaveClick}
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
