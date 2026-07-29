import { useRef, useState } from 'react'
import {
  HiOutlineXMark,
  HiOutlineDocumentArrowUp,
  HiOutlineArrowPath,
} from 'react-icons/hi2'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface ImportFileSlot {
  id: string
  label: string
  hint?: string
}

interface ImportDocxModalProps {
  open: boolean
  onClose: () => void
  /** Parse + apply the chosen file(s). Throw to surface an error in the modal. */
  onImport: (files: Record<string, File>) => Promise<void>
  title?: string
  description?: string
  /** One picker per slot. Defaults to a single ".docx file" slot keyed "file". */
  slots?: ImportFileSlot[]
}

const DEFAULT_SLOTS: ImportFileSlot[] = [
  { id: 'file', label: 'Choose a .docx file', hint: 'Word document, up to 10 MB' },
]

export default function ImportDocxModal({
  open,
  onClose,
  onImport,
  title = 'Import from document',
  description = 'Upload a Word file (.docx) to fill in the form.',
  slots = DEFAULT_SLOTS,
}: ImportDocxModalProps) {
  const [files, setFiles] = useState<Record<string, File>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  if (!open) return null

  const reset = () => {
    setFiles({})
    setError(null)
    setBusy(false)
  }

  const handleClose = () => {
    if (busy) return
    reset()
    onClose()
  }

  const handleSelect = (slotId: string, f: File | null) => {
    setError(null)
    if (!f) return
    const isDocx = f.type === DOCX_MIME || f.name.toLowerCase().endsWith('.docx')
    if (!isDocx) {
      setError('Please choose a Word document (.docx).')
      return
    }
    setFiles((prev) => ({ ...prev, [slotId]: f }))
  }

  const allChosen = slots.every((s) => files[s.id])

  const handleImport = async () => {
    if (!allChosen || busy) return
    setBusy(true)
    setError(null)
    try {
      await onImport(files)
      reset()
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Could not import the document. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,27,42,0.55)' }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[480px] rounded-[12px] bg-[var(--surface)] border border-[var(--border)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-bold text-primary tracking-[-0.01em]">
              {title}
            </h3>
            <p className="text-[12px] text-muted mt-0.5">{description}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="p-1 rounded-md hover:bg-[var(--surface-2)] text-muted border-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {slots.map((slot) => {
            const chosen = files[slot.id]
            return (
              <div key={slot.id} className="flex flex-col gap-1.5">
                {slots.length > 1 && (
                  <label className="text-[11.5px] font-semibold text-secondary">
                    {slot.label}
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => inputRefs.current[slot.id]?.click()}
                  disabled={busy}
                  className="flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface-2)] text-muted cursor-pointer hover:border-[var(--accent)] hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <HiOutlineDocumentArrowUp className="text-[24px]" />
                  <span className="text-[13px] font-medium text-primary">
                    {chosen ? chosen.name : slots.length > 1 ? 'Choose file' : slot.label}
                  </span>
                  <span className="text-[11.5px] text-muted">
                    {chosen ? 'Click to choose a different file' : slot.hint ?? 'Word document, up to 10 MB'}
                  </span>
                </button>
                <input
                  ref={(el) => {
                    inputRefs.current[slot.id] = el
                  }}
                  type="file"
                  accept={`.docx,${DOCX_MIME}`}
                  className="hidden"
                  onChange={(e) => handleSelect(slot.id, e.target.files?.[0] ?? null)}
                />
              </div>
            )
          })}

          {error && (
            <p className="text-[12px] text-[#DC2626] bg-[rgba(220,38,38,0.08)] rounded-[8px] px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[13px] font-medium hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!allChosen || busy}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--accent)] border border-[var(--accent)] text-white text-[13px] font-medium hover:opacity-85 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy && <HiOutlineArrowPath className="w-4 h-4 animate-spin" />}
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
