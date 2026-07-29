import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { HiOutlinePencilSquare } from 'react-icons/hi2'

interface Props {
  anchor: DOMRect
  // Short label for the kind of note, e.g. "Description" or "Remarks".
  heading: string
  lessonTitle: string
  placeholder: string
  initialValue: string
  onSave: (value: string) => void // commit the edited note
  onClose: () => void // dismiss without an explicit save (we also save on close)
}

const WIDTH = 320
const MAX_LEN = 500

export default function DescriptionEditor({
  anchor,
  heading,
  lessonTitle,
  placeholder,
  initialValue,
  onSave,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const textRef = useRef<HTMLTextAreaElement>(null)
  // Latest value kept in a ref so the unmount-time save isn't stale.
  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    const el = textRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const commitAndClose = () => {
    onSave(latest.current)
    onClose()
  }

  // Keep the popover inside the viewport: clamp width/position and flip above
  // the anchor when there isn't enough room below.
  const MARGIN = 8
  const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - WIDTH - MARGIN))
  const spaceBelow = window.innerHeight - anchor.bottom - MARGIN
  const spaceAbove = anchor.top - MARGIN
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
  const posStyle: CSSProperties = openUp
    ? { bottom: window.innerHeight - anchor.top + 4, left, width: WIDTH }
    : { top: anchor.bottom + 4, left, width: WIDTH }

  return createPortal(
    <>
      {/* Click-catcher: dismiss + save current text */}
      <div className="fixed inset-0 z-[60]" onMouseDown={commitAndClose} />

      <div
        data-testid="description-editor"
        className="fixed z-[61] flex flex-col gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl"
        style={posStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          <HiOutlinePencilSquare className="text-[14px] text-accent shrink-0" />
          <span className="text-[12px] font-bold text-primary truncate">{heading} · {lessonTitle}</span>
        </div>

        <textarea
          ref={textRef}
          value={value}
          maxLength={MAX_LEN}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full resize-y rounded-[8px] bg-[var(--surface-2)] text-primary text-[12.5px] leading-relaxed p-2 outline-none border border-[var(--border)] focus:border-[var(--accent)] transition-colors min-h-[88px]"
        />

        <div className="flex items-center justify-between">
          <span className="text-[10.5px] text-muted">
            {value.length}/{MAX_LEN}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setValue('')
                onSave('')
                onClose()
              }}
              className="px-2.5 py-1 rounded-[7px] bg-transparent text-muted text-[11.5px] font-semibold border border-[var(--border)] cursor-pointer hover:text-[#DC2626] hover:border-[#DC2626] transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={commitAndClose}
              className="px-3 py-1 rounded-[7px] bg-accent text-white text-[11.5px] font-bold border-none cursor-pointer hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
