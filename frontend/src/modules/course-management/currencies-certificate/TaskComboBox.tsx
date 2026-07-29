import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  HiOutlineMagnifyingGlass,
  HiOutlineChevronDown,
  HiOutlinePlus,
} from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import type { FlightTaskMasterOption } from './currencies-cert-api'

interface Props {
  /** Currently selected task master id (0 = nothing selected). */
  value: number
  options: FlightTaskMasterOption[]
  onChange: (id: number) => void
  /** Confirm creation of a new catalog task; returns the created option to select it. */
  onCreate: (taskNo: string, taskDescription: string) => Promise<FlightTaskMasterOption>
  placeholder?: string
  disabled?: boolean
}

export default function TaskComboBox({
  value,
  options,
  onChange,
  onCreate,
  placeholder,
  disabled,
}: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // When non-null, the create form is showing; holds the draft task no/desc.
  const [draft, setDraft] = useState<{ task_no: string; task_description: string } | null>(null)
  const [creating, setCreating] = useState(false)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelRect, setPanelRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value])

  const trimmedQuery = query.trim()
  const filtered = useMemo(() => {
    if (!trimmedQuery) return options
    const q = trimmedQuery.toLowerCase()
    return options.filter(
      (o) =>
        o.task_no.toLowerCase().includes(q) || o.task_description.toLowerCase().includes(q),
    )
  }, [options, trimmedQuery])

  const canCreate = trimmedQuery.length > 0
  const panelVisible = (open && !disabled) || draft !== null

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open && draft === null) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
      setDraft(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setDraft(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, draft])

  // Keep the portal panel anchored under the trigger.
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
    setDraft(null)
    setQuery('')
    queueMicrotask(() => inputRef.current?.focus())
  }

  const pickOption = (opt: FlightTaskMasterOption) => {
    onChange(opt.id)
    setQuery('')
    setOpen(false)
    setDraft(null)
  }

  const triggerAddNew = () => {
    if (!canCreate) return
    // Seed the task no with the query — most searches start from a task number.
    setDraft({ task_no: trimmedQuery, task_description: '' })
    setOpen(false)
  }

  const handleConfirmCreate = async () => {
    if (!draft) return
    const taskNo = draft.task_no.trim()
    const taskDesc = draft.task_description.trim()
    if (!taskNo || !taskDesc) return
    try {
      setCreating(true)
      const created = await onCreate(taskNo, taskDesc)
      onChange(created.id)
      setQuery('')
      setDraft(null)
    } finally {
      setCreating(false)
    }
  }

  const handleCancelCreate = () => {
    setDraft(null)
    setOpen(true)
    queueMicrotask(() => inputRef.current?.focus())
  }

  const displayValue = open
    ? query
    : selected
      ? `${selected.task_no} — ${selected.task_description}`
      : ''

  const createDisabled = creating || !draft?.task_no.trim() || !draft?.task_description.trim()

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={[
          'flex items-center gap-2 rounded-[10px] border bg-surface-2 px-3 py-2 transition-[border-color] duration-150',
          open ? 'border-accent' : 'border-bd',
          disabled ? 'opacity-70' : '',
        ].filter(Boolean).join(' ')}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          disabled={disabled}
          placeholder={placeholder ?? t('courseManagement.currenciesCert.flightPackage.taskSearchPlaceholder')}
          value={displayValue}
          onFocus={openDropdown}
          onClick={openDropdown}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered.length > 0) pickOption(filtered[0])
              else if (canCreate) triggerAddNew()
            }
          }}
          className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-primary placeholder:text-muted"
        />
        <HiOutlineMagnifyingGlass className="text-[14px] text-muted shrink-0" aria-hidden="true" />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? setOpen(false) : openDropdown())}
          disabled={disabled}
          className="bg-transparent border-none p-0 m-0 cursor-pointer text-muted hover:text-primary transition-colors disabled:cursor-not-allowed"
          aria-label={open ? 'Close options' : 'Open options'}
        >
          <HiOutlineChevronDown className={`text-[14px] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {panelVisible && panelRect && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: panelRect.left, top: panelRect.top, width: panelRect.width, zIndex: 9999 }}
        >
          {open && !disabled && draft === null && (
            <div
              role="listbox"
              className="rounded-[10px] border border-bd bg-surface shadow-lg overflow-hidden max-h-72 overflow-y-auto"
            >
              {filtered.map((opt) => {
                const isSelected = opt.id === value
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pickOption(opt)}
                    className={[
                      'w-full text-start px-3 py-2 cursor-pointer border-none bg-transparent font-sans transition-colors flex items-baseline gap-2',
                      isSelected ? 'bg-accent/10 font-semibold' : 'hover:bg-surface-2',
                    ].join(' ')}
                  >
                    <span className="shrink-0 min-w-[64px] text-[12.5px] font-semibold text-accent">
                      {opt.task_no}
                    </span>
                    <span className="text-[13px] text-primary truncate">{opt.task_description}</span>
                  </button>
                )
              })}

              {filtered.length === 0 && !canCreate && (
                <div className="px-3 py-3 text-[13px] text-muted text-center">
                  {t('courseManagement.currenciesCert.flightPackage.noTaskMatches')}
                </div>
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
                    {t('courseManagement.currenciesCert.flightPackage.addTaskAsNew').replace('#{q}', trimmedQuery)}
                  </span>
                </button>
              )}
            </div>
          )}

          {draft !== null && (
            <div className="rounded-[10px] border border-bd bg-surface shadow-lg p-3 flex flex-col gap-2">
              <p className="text-[11.5px] font-semibold text-secondary">
                {t('courseManagement.currenciesCert.flightPackage.newTaskTitle')}
              </p>
              <input
                type="text"
                autoFocus
                value={draft.task_no}
                onChange={(e) => setDraft({ ...draft, task_no: e.target.value })}
                placeholder={t('courseManagement.currenciesCert.flightPackage.taskNoPlaceholder')}
                className="px-2.5 py-1.5 rounded-[8px] border border-bd bg-surface-2 text-[13px] text-primary placeholder:text-muted outline-none focus:border-accent"
              />
              <textarea
                value={draft.task_description}
                onChange={(e) => setDraft({ ...draft, task_description: e.target.value })}
                placeholder={t('courseManagement.currenciesCert.flightPackage.taskDescriptionPlaceholder')}
                rows={2}
                className="px-2.5 py-1.5 rounded-[8px] border border-bd bg-surface-2 text-[13px] text-primary placeholder:text-muted outline-none focus:border-accent resize-y"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelCreate}
                  disabled={creating}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold bg-surface-2 text-primary border border-bd hover:bg-bd transition-colors cursor-pointer font-sans disabled:opacity-60"
                >
                  {t('courseManagement.currenciesCert.common.close')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCreate}
                  disabled={createDisabled}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] font-semibold bg-accent text-white border-none hover:opacity-90 transition-opacity cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating
                    ? t('courseManagement.currenciesCert.flightPackage.creating')
                    : t('courseManagement.currenciesCert.flightPackage.create')}
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
