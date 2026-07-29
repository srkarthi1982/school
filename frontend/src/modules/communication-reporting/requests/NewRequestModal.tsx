import { useEffect, useState } from 'react'
import { HiOutlineXMark } from 'react-icons/hi2'
import { createRequest, type ChatUser, type RequestDetail } from './requests-api'
import RecipientPicker from './components/RecipientPicker'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (req: RequestDetail) => void
  isStudent: boolean
}

export default function NewRequestModal({ open, onClose, onCreated, isStudent }: Props) {
  const [purpose, setPurpose] = useState('')
  const [description, setDescription] = useState('')
  const [recipient, setRecipient] = useState<ChatUser | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDebug, setSelectedDebug] = useState<ChatUser | null>(null)

  useEffect(() => {
    if (open) {
      setPurpose('')
      setDescription('')
      setRecipient(null)
      setSubmitting(false)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const canSubmit =
    purpose.trim() && description.trim() && (isStudent || recipient) && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await createRequest({
        purpose: purpose.trim(),
        description: description.trim(),
        recipient_id: isStudent ? null : recipient?.id ?? null,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 className="text-[15px] font-bold text-primary">New Personal Request</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:bg-[var(--surface-2)] bg-transparent border-none cursor-pointer"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-muted uppercase tracking-wider">
              Purpose
            </span>
            <input
              type="text"
              maxLength={255}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="What is this about?"
              autoFocus
              className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
              style={{ borderColor: 'var(--border)' }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold text-muted uppercase tracking-wider">
              Description
            </span>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you need…"
              className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] resize-none"
              style={{ borderColor: 'var(--border)' }}
            />
          </label>

          {!isStudent ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-muted uppercase tracking-wider">
                Recipient
              </span>
              <RecipientPicker value={recipient} onChange={setRecipient} />
            </label>
          ) : (
            <p className="text-[12px] text-muted">
              Your request will be routed to the teacher pool. The first available teacher
              will claim and respond.
            </p>
          )}

          {error && <p className="text-[12px] text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer bg-transparent border border-[var(--border)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {submitting ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
