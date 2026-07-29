import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  HiOutlineMagnifyingGlass,
  HiOutlineChevronDown,
  HiOutlinePlus,
  HiOutlineCheck,
} from 'react-icons/hi2'

export interface ComboBoxOption {
  value: string
  label: string
}

interface Props {
  /** Currently selected option `value` (empty string = nothing selected). */
  value: string
  /** Full list of available options. */
  options: ComboBoxOption[]
  /** Fired when the user picks an existing option. */
  onChange: (value: string) => void
  /**
   * Fired when the user confirms creation of a new entry.
   * Return the newly-created option (with its final `value`) so the combo box can select it.
   * If omitted, the "Add new" affordance is hidden and the field behaves as a search-only select.
   */
  onCreate?: (label: string) => ComboBoxOption | Promise<ComboBoxOption>
  /** Word used in the "Add 'X' as a new {entityLabel}" prompt. Defaults to "item". */
  entityLabel?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  /** Optional id for accessibility / form labelling. */
  id?: string
}

export default function ComboBox({
  value,
  options,
  onChange,
  onCreate,
  entityLabel = 'item',
  placeholder = 'Select or type...',
  disabled,
  required,
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pendingNew, setPendingNew] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  // The dropdown / confirm-create panel is rendered through a portal on
  // document.body (see below) so it can never be clipped by an ancestor's
  // `overflow` or buried under a modal's stacking context. `panelRef` lets the
  // outside-click handler treat clicks inside that portal as "inside", and
  // `panelRect` positions it under the trigger in viewport (fixed) coordinates.
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelRect, setPanelRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const selected = useMemo(
    () => options.find(o => o.value === value) ?? null,
    [options, value],
  )

  const trimmedQuery = query.trim()
  const filtered = useMemo(() => {
    if (!trimmedQuery) return options
    const q = trimmedQuery.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, trimmedQuery])

  const exactMatch = useMemo(
    () => options.some(o => o.label.toLowerCase() === trimmedQuery.toLowerCase()),
    [options, trimmedQuery],
  )

  const canCreate = !!onCreate && trimmedQuery.length > 0 && !exactMatch

  const panelVisible = (open && !disabled) || pendingNew !== null

  // close on outside click / Escape
  useEffect(() => {
    if (!open && pendingNew === null) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      // The panel lives in a body-level portal, so it's outside wrapperRef —
      // check both before treating the click as "outside".
      if (wrapperRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
      setPendingNew(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setPendingNew(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, pendingNew])

  // Keep the portal panel anchored under the trigger, following layout changes
  // (scroll in any container — capture phase — and viewport resize).
  useLayoutEffect(() => {
    if (!panelVisible) return
    const measure = () => {
      const el = wrapperRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPanelRect({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [panelVisible])

  const openDropdown = () => {
    if (disabled) return
    setOpen(true)
    setPendingNew(null)
    setQuery(selected?.label ?? '')
    queueMicrotask(() => inputRef.current?.focus())
  }

  const pickOption = (opt: ComboBoxOption) => {
    onChange(opt.value)
    setQuery('')
    setOpen(false)
    setPendingNew(null)
  }

  const triggerAddNew = () => {
    if (!canCreate) return
    setPendingNew(trimmedQuery)
    setOpen(false)
  }

  const handleConfirmCreate = async () => {
    if (!pendingNew || !onCreate) return
    try {
      setCreating(true)
      const created = await onCreate(pendingNew)
      onChange(created.value)
      setQuery('')
      setPendingNew(null)
    } finally {
      setCreating(false)
    }
  }

  const handleCancelCreate = () => {
    setPendingNew(null)
    setOpen(true)
    queueMicrotask(() => inputRef.current?.focus())
  }

  const displayValue = open ? query : (selected?.label ?? '')

  return (
    <div ref={wrapperRef} className="relative">
      {/* ── Trigger / search input ── */}
      <div
        className={[
          'flex items-center gap-2 rounded-[10px] border bg-surface-2 px-3 py-2 transition-[border-color] duration-150',
          open ? 'border-accent' : 'border-bd',
          disabled ? 'opacity-70' : '',
        ].filter(Boolean).join(' ')}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          onFocus={openDropdown}
          onClick={openDropdown}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setPendingNew(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered.length > 0 && (!canCreate || exactMatch)) {
                pickOption(filtered[0])
              } else if (canCreate) {
                triggerAddNew()
              }
            }
          }}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-primary placeholder:text-muted"
        />
        {selected && !open && (
          <HiOutlineCheck className="text-[15px] text-accent shrink-0" aria-hidden="true" />
        )}
        <HiOutlineMagnifyingGlass className="text-[14px] text-muted shrink-0" aria-hidden="true" />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? setOpen(false) : openDropdown())}
          className="bg-transparent border-none p-0 m-0 cursor-pointer text-muted hover:text-primary transition-colors"
          aria-label={open ? 'Close options' : 'Open options'}
        >
          <HiOutlineChevronDown
            className={`text-[14px] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Hidden input keeps native form `required` semantics. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          className="sr-only pointer-events-none"
          style={{ position: 'absolute', opacity: 0, height: 0, width: 0 }}
        />
      )}

      {/* ── Dropdown list / confirm-create panel ──
          Rendered in a body-level portal with fixed positioning so it overlays
          everything (modals, footers) and is never clipped by an ancestor's
          overflow. Positioned under the trigger via `panelRect`. */}
      {panelVisible && panelRect && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            left: panelRect.left,
            top: panelRect.top,
            width: panelRect.width,
            zIndex: 9999,
          }}
        >
          {open && !disabled && pendingNew === null && (
            <div
              role="listbox"
              className="rounded-[10px] border border-bd bg-surface shadow-lg overflow-hidden max-h-64 overflow-y-auto"
            >
              {filtered.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pickOption(opt)}
                    className={[
                      'w-full text-start px-3 py-2 text-[13px] cursor-pointer border-none bg-transparent font-sans transition-colors',
                      isSelected
                        ? 'bg-accent/10 text-primary font-semibold'
                        : 'text-primary hover:bg-surface-2',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                )
              })}

              {filtered.length === 0 && !canCreate && (
                <div className="px-3 py-3 text-[13px] text-muted text-center">No matches</div>
              )}

              {canCreate && (
                <button
                  type="button"
                  onClick={triggerAddNew}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-2 text-[13px] text-accent cursor-pointer border-none bg-accent/5 hover:bg-accent/10 font-sans transition-colors',
                    filtered.length > 0 ? 'border-t border-bd' : '',
                  ].join(' ')}
                >
                  <HiOutlinePlus className="text-[14px] shrink-0" />
                  <span className="truncate">
                    Add &ldquo;{trimmedQuery}&rdquo; as a new {entityLabel}
                  </span>
                </button>
              )}
            </div>
          )}

          {pendingNew !== null && (
            <div className="rounded-[10px] border border-bd bg-surface shadow-lg p-3">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelCreate}
                  disabled={creating}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold bg-surface-2 text-primary border border-bd hover:bg-bd transition-colors cursor-pointer font-sans disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCreate}
                  disabled={creating}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold bg-accent text-white border-none hover:opacity-90 transition-opacity cursor-pointer font-sans disabled:opacity-60"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Create &ldquo;{pendingNew}&rdquo; as a new {entityLabel}?
              </p>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
