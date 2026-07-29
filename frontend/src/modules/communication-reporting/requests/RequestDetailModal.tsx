import { useEffect, useState } from 'react'
import { HiOutlineXMark } from 'react-icons/hi2'
import {
  cancelRequest,
  claimRequest,
  editRequest,
  forwardRequest,
  getRequest,
  resolveRequest,
  returnRequest,
  type ChatUser,
  type RequestDetail,
} from './requests-api'
import StatusBadge from './components/StatusBadge'
import StatusTimeline from './components/StatusTimeline'
import RecipientPicker from './components/RecipientPicker'

interface Props {
  open: boolean
  requestId: string | null
  currentUserId: number
  isAdmin: boolean
  isTeacher: boolean
  onClose: () => void
  onChanged: () => void
}

type ActionMode = null | 'return' | 'resolve' | 'cancel' | 'forward' | 'edit'

const TERMINAL = new Set(['resolved', 'approved', 'canceled'])

export default function RequestDetailModal({
  open,
  requestId,
  currentUserId,
  isAdmin,
  isTeacher,
  onClose,
  onChanged,
}: Props) {
  const [request, setRequest] = useState<RequestDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ActionMode>(null)
  const [note, setNote] = useState('')
  const [editPurpose, setEditPurpose] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [forwardTo, setForwardTo] = useState<ChatUser | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !requestId) {
      setRequest(null)
      setMode(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    getRequest(requestId)
      .then((r) => setRequest(r))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [open, requestId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const isCreator = !!request && request.created_by?.id === currentUserId
  const isCurrentRecipient =
    !!request && request.current_recipient?.id === currentUserId
  const isPooled =
    !!request && request.recipient_pool !== null && request.current_recipient === null
  const canClaim = isPooled && (isTeacher || isAdmin)
  const canRespond = isCurrentRecipient || (isAdmin && !isPooled)
  const isTerminal = !!request && TERMINAL.has(request.status)
  const canCancel = isCreator && !!request && !isTerminal
  const canEdit = isCreator && !!request && request.status === 'returned'
  const canForward = canRespond && (isTeacher || isAdmin) && !isTerminal

  const startMode = (m: ActionMode) => {
    setMode(m)
    setNote('')
    setForwardTo(null)
    if (m === 'edit' && request) {
      setEditPurpose(request.purpose)
      setEditDescription(request.description)
    }
  }

  const refresh = async (id: string) => {
    const r = await getRequest(id)
    setRequest(r)
    onChanged()
  }

  const runAction = async (action: () => Promise<RequestDetail>) => {
    if (!request) return
    setBusy(true)
    setError(null)
    try {
      const updated = await action()
      setRequest(updated)
      setMode(null)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const handleClaim = () => request && runAction(() => claimRequest(request.id))
  const handleResolve = () =>
    request && runAction(() => resolveRequest(request.id, note || undefined))
  const handleCancel = () =>
    request && runAction(() => cancelRequest(request.id, note || undefined))
  const handleReturn = () => request && runAction(() => returnRequest(request.id, note))
  const handleForward = () =>
    request && forwardTo && runAction(() => forwardRequest(request.id, forwardTo.id, note || undefined))
  const handleEdit = () =>
    request &&
    runAction(() => editRequest(request.id, { purpose: editPurpose.trim(), description: editDescription.trim() }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col max-h-[85vh]"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-[15px] font-bold text-primary truncate flex-1">
            {request ? request.purpose : 'Personal Request'}
          </h3>
          {request && <StatusBadge status={request.status} />}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:bg-[var(--surface-2)] bg-transparent border-none cursor-pointer"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto thin-scrollbar-light flex flex-col gap-4">
          {loading && <p className="text-[12px] text-muted">Loading…</p>}
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          {request && (
            <>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <p className="text-muted uppercase tracking-wider text-[10.5px] font-bold mb-0.5">
                    From
                  </p>
                  <p className="text-primary font-semibold">
                    {request.created_by?.full_name ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted uppercase tracking-wider text-[10.5px] font-bold mb-0.5">
                    To
                  </p>
                  <p className="text-primary font-semibold">
                    {request.current_recipient
                      ? request.current_recipient.full_name
                      : isPooled
                      ? `Teacher pool (${request.recipient_pool})`
                      : '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-muted uppercase tracking-wider text-[10.5px] font-bold mb-1">
                  Description
                </p>
                <p className="text-[13px] text-primary whitespace-pre-line leading-relaxed">
                  {request.description}
                </p>
              </div>

              {request.return_reason && request.status === 'returned' && (
                <div className="rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2">
                  <p className="text-[11.5px] font-bold text-amber-700 mb-0.5 uppercase tracking-wider">
                    Returned with note
                  </p>
                  <p className="text-[12.5px] text-amber-900 whitespace-pre-line">
                    {request.return_reason}
                  </p>
                </div>
              )}

              <div>
                <p className="text-muted uppercase tracking-wider text-[10.5px] font-bold mb-2">
                  History
                </p>
                <StatusTimeline history={request.history} />
              </div>

              {mode === 'edit' && (
                <div className="flex flex-col gap-2 rounded-[10px] border p-3" style={{ borderColor: 'var(--border)' }}>
                  <input
                    type="text"
                    value={editPurpose}
                    maxLength={255}
                    onChange={(e) => setEditPurpose(e.target.value)}
                    placeholder="Purpose"
                    className="w-full rounded-[8px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)]"
                    style={{ borderColor: 'var(--border)' }}
                  />
                  <textarea
                    rows={4}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description"
                    className="w-full rounded-[8px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)] resize-none"
                    style={{ borderColor: 'var(--border)' }}
                  />
                </div>
              )}

              {mode === 'forward' && (
                <div className="flex flex-col gap-2 rounded-[10px] border p-3" style={{ borderColor: 'var(--border)' }}>
                  <RecipientPicker value={forwardTo} onChange={setForwardTo} placeholder="Forward to…" />
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional note"
                    className="w-full rounded-[8px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)] resize-none"
                    style={{ borderColor: 'var(--border)' }}
                  />
                </div>
              )}

               {(mode === 'return' || mode === 'resolve' || mode === 'cancel') && (
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={mode === 'return' ? 'Reason for returning (required)' : 'Optional note'}
                  className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--accent)] resize-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              )}
            </>
          )}
        </div>

        {request && (
          <div
            className="flex items-center gap-2 px-5 py-3 border-t shrink-0 flex-wrap"
            style={{ borderColor: 'var(--border)' }}
          >
            {mode === null && (
              <>
                {canClaim && (
                  <button
                    onClick={handleClaim}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    Claim
                  </button>
                )}
                {canRespond && !isTerminal && (
                  <>
                    <button
                      onClick={() => startMode('return')}
                      className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-secondary border border-[var(--border)] hover:text-primary cursor-pointer bg-transparent"
                    >
                      Return
                    </button>
                    <button
                      onClick={() => startMode('resolve')}
                      className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer"
                      style={{ background: 'var(--success)' }}
                    >
                      Resolve
                   </button>
                  </>
                 )}
                {canForward && (
                  <button
                    onClick={() => startMode('forward')}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-secondary border border-[var(--border)] hover:text-primary cursor-pointer bg-transparent"
                  >
                    Forward
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => startMode('edit')}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-secondary border border-[var(--border)] hover:text-primary cursor-pointer bg-transparent"
                  >
                    Edit & Resubmit
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => startMode('cancel')}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-red-600 border border-[var(--border)] hover:bg-red-50 cursor-pointer bg-transparent ms-auto"
                  >
                    Cancel Request
                  </button>
                )}
              </>
            )}

            {mode !== null && (
              <>
                <button
                  onClick={() => setMode(null)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-secondary border border-[var(--border)] hover:text-primary cursor-pointer bg-transparent"
                >
                  Back
                </button>
                {mode === 'return' && (
                  <button
                    onClick={handleReturn}
                    disabled={busy || !note.trim()}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto"
                    style={{ background: 'var(--danger)' }}
                  >
                    Confirm Return
                  </button>
                )}
                {mode === 'resolve' && (
                  <button
                    onClick={handleResolve}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto"
                    style={{ background: 'var(--success)' }}
                  >
                    Confirm Resolve
                  </button>
                )}
                {mode === 'cancel' && (
                  <button
                    onClick={handleCancel}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto"
                    style={{ background: 'var(--danger)' }}
                  >
                    Confirm Cancel
                  </button>
                )}
                {mode === 'forward' && (
                  <button
                    onClick={handleForward}
                    disabled={busy || !forwardTo}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto"
                    style={{ background: 'var(--accent)' }}
                  >
                    Confirm Forward
                  </button>
                )}
                {mode === 'edit' && (
                  <button
                    onClick={handleEdit}
                    disabled={busy || !editPurpose.trim() || !editDescription.trim()}
                    className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer disabled:opacity-50 ms-auto"
                    style={{ background: 'var(--accent)' }}
                  >
                    Save & Resubmit
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
