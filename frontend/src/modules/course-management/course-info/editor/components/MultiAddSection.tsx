import { useState } from 'react'
import { HiOutlinePlus, HiOutlineTrash, HiOutlinePencilSquare } from 'react-icons/hi2'
import ComboBox, { type ComboBoxOption } from '../../../../../infra/shared/components/ComboBox'

export interface AddedItem {
  id: string
  quantity?: string
}

interface MultiAddSectionProps {
  /** Optional label rendered above the picker row. Omit if the parent CardSection already shows the title. */
  label?: string
  helperText?: string
  pendingId: string
  setPendingId: (v: string) => void
  options: ComboBoxOption[]
  onAdd: () => void
  onCreate?: (label: string) => Promise<ComboBoxOption>
  entityLabel: string
  items: AddedItem[]
  optionLabelFor: (id: string) => string
  onRemove: (idx: number) => void
  /** Provide to enable per-item quantity badge (Resources tab). Omit to render name-only pills. */
  onQuantityChange?: (idx: number, next: string) => void
  showQuantity?: boolean
  readOnly?: boolean
}

const labelCls = 'text-[11.5px] font-semibold text-secondary'

function allowOnlyInt(e: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '-', '+', '.'].includes(e.key)) {
    e.preventDefault()
  }
}

export default function MultiAddSection({
  label,
  helperText,
  pendingId,
  setPendingId,
  options,
  onAdd,
  onCreate,
  entityLabel,
  items,
  optionLabelFor,
  onRemove,
  onQuantityChange,
  showQuantity = false,
  readOnly,
}: MultiAddSectionProps) {
  const [editingIdx, setEditingIdx] = useState<Set<number>>(new Set())

  const startEdit = (idx: number) =>
    setEditingIdx((prev) => new Set(prev).add(idx))

  const stopEdit = (idx: number) =>
    setEditingIdx((prev) => {
      const next = new Set(prev)
      next.delete(idx)
      return next
    })

  const pendingAlreadyAdded =
    pendingId !== '' && items.some((it) => it.id === pendingId)

  return (
    <div className="flex flex-col gap-3">
      {label && <label className={labelCls}>{label}</label>}
      {helperText && <p className="text-[11.5px] text-muted -mt-1">{helperText}</p>}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[140px]">
          <ComboBox
            value={pendingId}
            options={options}
            onChange={(v) => setPendingId(v)}
            onCreate={onCreate}
            entityLabel={entityLabel}
            placeholder={`Select or add ${entityLabel}`}
            disabled={readOnly}
          />
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={readOnly || pendingId === '' || pendingAlreadyAdded}
          className="h-9 shrink-0 inline-flex items-center gap-1.5 px-3 rounded-[8px] bg-accent-light text-accent text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <HiOutlinePlus className="text-[13px]" />
          Add
        </button>
      </div>
      {pendingAlreadyAdded && (
        <p className="text-[11px] text-muted">
          This {entityLabel} is already in the list.
        </p>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10.5px] font-semibold text-muted uppercase tracking-wide">
              Added ({items.length})
            </span>
            <span className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
            {items.map((item, idx) => {
              const isEditingQty = editingIdx.has(idx)
              const hasQty = item.quantity != null && item.quantity !== ''

              return (
                <li
                  key={`${item.id}-${idx}`}
                  className="flex items-center gap-3 pl-2 pr-1 py-1.5 rounded-full bg-[var(--accent-light)] border border-[var(--border)]"
                >
                  <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10.5px] font-semibold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-[13px] text-primary truncate flex-1">
                    {optionLabelFor(item.id) || '—'}
                  </span>

                  {showQuantity && (
                    <>
                      {isEditingQty || hasQty ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[12px]">
                          <span className="text-muted">Qty</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            autoFocus={isEditingQty && !hasQty}
                            className="w-12 bg-transparent outline-none border-none text-primary text-[12px] text-right"
                            value={item.quantity ?? ''}
                            onChange={(e) =>
                              onQuantityChange?.(idx, e.target.value)
                            }
                            onKeyDown={allowOnlyInt}
                            onBlur={() => {
                              if (!item.quantity) stopEdit(idx)
                            }}
                            placeholder="0"
                            disabled={readOnly}
                            aria-label="Quantity"
                          />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => !readOnly && startEdit(idx)}
                          disabled={readOnly}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface)] border border-dashed border-[var(--border)] text-muted text-[11.5px] cursor-pointer hover:text-primary hover:border-[var(--accent)] disabled:cursor-not-allowed transition-colors"
                          aria-label="Set quantity"
                        >
                          <HiOutlinePencilSquare className="text-[11px]" />
                          Set qty
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    disabled={readOnly}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-full bg-transparent border-none text-muted cursor-pointer hover:text-[#DC2626] hover:bg-[rgba(220,38,38,0.10)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label={`Remove ${entityLabel}`}
                  >
                    <HiOutlineTrash className="text-[13px]" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
