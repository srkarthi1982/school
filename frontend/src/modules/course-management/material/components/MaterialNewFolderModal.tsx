import { useEffect, useState } from 'react'
import { HiOutlineXMark } from 'react-icons/hi2'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void> | void
  title: string
  placeholder: string
  createLabel: string
  initialValue?: string
}

export default function MaterialNewFolderModal({
  open,
  onClose,
  onCreate,
  title,
  placeholder,
  createLabel,
  initialValue,
}: Props) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialValue ?? '')
      setCreating(false)
    }
  }, [open, initialValue])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await onCreate(name.trim())
    } catch {
      setCreating(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-[15px] font-bold text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:bg-[var(--surface-2)]"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="w-full rounded-[10px] border bg-[var(--surface-2)] px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
            style={{ borderColor: 'var(--border)' }}
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer bg-transparent border border-[var(--border)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {createLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
