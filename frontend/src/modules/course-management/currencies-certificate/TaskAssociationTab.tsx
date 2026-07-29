import {useEffect, useMemo, useState} from 'react'
import {
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineLink,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineXMark,
} from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useCurrenciesCertStore, {
  selectTaskAssociations,
  selectEoOptions,
  selectFlightPackages,
  selectAvailableCurrencies,
  selectSelectedCurrencyIds,
} from './store'
import useFullBleedStore from "../../../infra/shared/store/useFullBleedStore.ts";

interface Option {
  id: number
  label: string
}

export default function TaskAssociationTab({ isComplete }: { isComplete: boolean }) {
  const { t } = useI18n()
  const associations = useCurrenciesCertStore(selectTaskAssociations)
  const addAssociation = useCurrenciesCertStore((s) => s.addTaskAssociation)
  const readOnly = isComplete

  // Collapsed record indices (default expanded).
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const toggleCollapsed = (index: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] px-6 pt-4">
        <div>
          <h2 className="text-[18px] font-bold text-primary">
            {t('courseManagement.currenciesCert.taskAssociation.title')}
          </h2>
          <p className="text-[12px] text-muted mt-0.5">
            {t('courseManagement.currenciesCert.taskAssociation.description')}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addAssociation}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--accent)] border border-[var(--accent)] text-white text-[12px] font-semibold cursor-pointer transition-opacity hover:opacity-85"
            style={{ boxShadow: '0 1px 2px rgba(6,85,92,0.25)' }}
          >
            <HiOutlinePlus className="w-4 h-4 flex-none" />
            {t('courseManagement.currenciesCert.taskAssociation.addAssociation')}
          </button>
        )}
      </div>

      {/* Association list */}
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar-light px-6 py-4 flex flex-col gap-3">
        {associations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 text-muted py-16">
            <HiOutlineLink className="text-[24px]" />
            <p className="text-[13px]">{t('courseManagement.currenciesCert.taskAssociation.empty')}</p>
          </div>
        ) : (
          associations.map((_, index) => (
            <AssociationCard
              key={index}
              index={index}
              readOnly={readOnly}
              collapsed={collapsed.has(index)}
              onToggleCollapsed={() => toggleCollapsed(index)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function AssociationCard({
  index,
  readOnly,
  collapsed,
  onToggleCollapsed,
}: {
  index: number
  readOnly: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const { t } = useI18n()
  const association = useCurrenciesCertStore((s) => s.taskAssociations[index])
  const allAssociations = useCurrenciesCertStore(selectTaskAssociations)
  const flightPackages = useCurrenciesCertStore(selectFlightPackages)
  const eoOptions = useCurrenciesCertStore(selectEoOptions)
  const availableCurrencies = useCurrenciesCertStore(selectAvailableCurrencies)
  const selectedCurrencyIds = useCurrenciesCertStore(selectSelectedCurrencyIds)

  const setTask = useCurrenciesCertStore((s) => s.setTaskAssociationTask)
  const toggleEO = useCurrenciesCertStore((s) => s.toggleTaskAssociationEO)
  const toggleCurrency = useCurrenciesCertStore((s) => s.toggleTaskAssociationCurrency)
  const removeAssociation = useCurrenciesCertStore((s) => s.removeTaskAssociation)

  // Tasks already associated in OTHER records — each task may be associated
  // only once, so these are excluded from this record's selector.
  const usedByOthers = useMemo(() => {
    const ids = new Set<number>()
    allAssociations.forEach((a, i) => {
      if (i !== index && a.task_master_id !== 0) ids.add(a.task_master_id)
    })
    return ids
  }, [allAssociations, index])

  // Tasks selectable for association: the distinct tasks already added to this
  // course's flight packages, minus tasks already used by another record.
  const taskOptions = useMemo<Option[]>(() => {
    const seen = new Set<number>()
    const out: Option[] = []
    for (const pkg of flightPackages) {
      for (const tk of pkg.tasks) {
        if (seen.has(tk.task_master_id)) continue
        seen.add(tk.task_master_id)
        if (usedByOthers.has(tk.task_master_id)) continue
        out.push({
          id: tk.task_master_id,
          label: tk.task_no ? `${tk.task_no} — ${tk.task_description}` : tk.task_description,
        })
      }
    }
    return out
  }, [flightPackages, usedByOthers])

  // Currencies selectable: those selected on the Currencies tab.
  const currencyOptions = useMemo<Option[]>(() => {
    const nameById = new Map(availableCurrencies.map((c) => [c.id, c.name]))
    return selectedCurrencyIds.map((id) => ({ id, label: nameById.get(id) ?? `#${id}` }))
  }, [availableCurrencies, selectedCurrencyIds])

  const eoChoices = useMemo<Option[]>(
    () => eoOptions.map((o) => ({ id: o.id, label: o.label })),
    [eoOptions],
  )

  if (!association) return null

  const selectedEoIds = association.enabling_objectives.map((e) => e.enabling_objective_id)
  const selectedCurIds = association.currencies.map((c) => c.currency_master_id)

  const taskSummary = association.task_master_id
    ? association.task_no
      ? `${association.task_no} — ${association.task_description}`
      : association.task_description
    : t('courseManagement.currenciesCert.taskAssociation.selectTask')

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)]">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="shrink-0 p-1 rounded-md text-muted hover:text-primary hover:bg-[var(--surface)] border-none bg-transparent cursor-pointer"
          title={collapsed
            ? t('courseManagement.currenciesCert.flightPackage.expand')
            : t('courseManagement.currenciesCert.flightPackage.collapse')}
        >
          {collapsed ? <HiOutlineChevronRight className="w-4 h-4" /> : <HiOutlineChevronDown className="w-4 h-4" />}
        </button>
        <span className="shrink-0 text-[11px] font-bold text-muted uppercase tracking-[0.05em]">
          {t('courseManagement.currenciesCert.taskAssociation.record')} {index + 1}
        </span>
        <span className="flex-1 min-w-0 text-[12.5px] text-primary truncate">
          {collapsed && (
            <>
              {taskSummary}
              <span className="text-muted">
                {' · '}
                {selectedEoIds.length} {t('courseManagement.currenciesCert.taskAssociation.eoShort')}
                {' · '}
                {selectedCurIds.length} {t('courseManagement.currenciesCert.taskAssociation.currencyShort')}
              </span>
            </>
          )}
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={() => removeAssociation(index)}
            className="shrink-0 p-1.5 rounded-md text-muted hover:text-[#DC2626] hover:bg-[#fef3f2] border-none bg-transparent cursor-pointer"
            title={t('courseManagement.currenciesCert.taskAssociation.removeAssociation')}
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        )}
      </div>

      {!collapsed && (
      <div className="px-3 py-3 flex flex-col gap-3">
        {/* Task */}
        <Field label={t('courseManagement.currenciesCert.taskAssociation.task')}>
          <select
            value={association.task_master_id || ''}
            disabled={readOnly}
            onChange={(e) => setTask(index, Number(e.target.value))}
            className="w-full px-2.5 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-primary focus:outline-none focus:border-accent disabled:bg-[var(--surface-2)] disabled:cursor-not-allowed cursor-pointer"
          >
            <option value="" disabled>
              {taskOptions.length === 0
                ? t('courseManagement.currenciesCert.taskAssociation.noTasks')
                : t('courseManagement.currenciesCert.taskAssociation.selectTask')}
            </option>
            {/* Keep the current selection visible even if it left the packages. */}
            {association.task_master_id !== 0 &&
              !taskOptions.some((o) => o.id === association.task_master_id) && (
                <option value={association.task_master_id}>
                  {association.task_no
                    ? `${association.task_no} — ${association.task_description}`
                    : association.task_description}
                </option>
              )}
            {taskOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Enabling Objectives */}
        <Field label={t('courseManagement.currenciesCert.taskAssociation.enablingObjectives')}>
          <MultiSelect
            options={eoChoices}
            selectedIds={selectedEoIds}
            onToggle={(id) => toggleEO(index, id)}
            disabled={readOnly}
            placeholder={t('courseManagement.currenciesCert.taskAssociation.selectEo')}
            emptyHint={t('courseManagement.currenciesCert.taskAssociation.noEo')}
          />
        </Field>

        {/* Currencies */}
        <Field label={t('courseManagement.currenciesCert.taskAssociation.currencies')}>
          <MultiSelect
            options={currencyOptions}
            selectedIds={selectedCurIds}
            onToggle={(id) => toggleCurrency(index, id)}
            disabled={readOnly}
            placeholder={t('courseManagement.currenciesCert.taskAssociation.selectCurrency')}
            emptyHint={t('courseManagement.currenciesCert.taskAssociation.noCurrency')}
          />
        </Field>
      </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-muted uppercase tracking-[0.05em]">{label}</span>
      {children}
    </div>
  )
}

/**
 * Chip-based multi-select. Selected items render as removable chips; an inline
 * "Add" button reveals an in-flow checklist panel (no portal, so it never
 * clips inside the scrollable tab).
 */
function MultiSelect({
  options,
  selectedIds,
  onToggle,
  disabled,
  placeholder,
  emptyHint,
}: {
  options: Option[]
  selectedIds: number[]
  onToggle: (id: number) => void
  disabled?: boolean
  placeholder: string
  emptyHint: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedSet = new Set(selectedIds)
  const selectedOptions = options.filter((o) => selectedSet.has(o.id))
  const trimmed = query.trim().toLowerCase()
  const filtered = trimmed
    ? options.filter((o) => o.label.toLowerCase().includes(trimmed))
    : options

  if (options.length === 0) {
    return <p className="text-[12px] text-muted py-1.5">{emptyHint}</p>
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedOptions.map((o) => (
          <span
            key={o.id}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-[var(--accent-light)] text-accent text-[12px] font-semibold"
          >
            {o.label}
            {!disabled && (
              <button
                type="button"
                onClick={() => onToggle(o.id)}
                className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full hover:bg-[rgba(0,0,0,0.08)] border-none bg-transparent cursor-pointer text-accent"
                title={t('courseManagement.currenciesCert.taskAssociation.removeItem')}
              >
                <HiOutlineXMark className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {selectedOptions.length === 0 && (
          <span className="text-[12px] text-muted py-1">{placeholder}</span>
        )}
        {!disabled && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-[var(--border)] text-muted text-[12px] font-semibold hover:text-accent hover:border-accent bg-transparent cursor-pointer transition-colors"
          >
            <HiOutlinePlus className="w-3.5 h-3.5" />
            {t('courseManagement.currenciesCert.taskAssociation.add')}
            <HiOutlineChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('courseManagement.currenciesCert.taskAssociation.search')}
              className="w-full px-2.5 py-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[13px] text-primary placeholder:text-muted outline-none focus:border-accent"
            />
          </div>
          <div className="max-h-52 overflow-y-auto thin-scrollbar-light">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-muted text-center">
                {t('courseManagement.currenciesCert.taskAssociation.noMatches')}
              </p>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.id)
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onToggle(o.id)}
                    className={[
                      'w-full text-start px-3 py-2 cursor-pointer border-none font-sans transition-colors flex items-center gap-2',
                      checked ? 'bg-accent/10 font-semibold' : 'bg-transparent hover:bg-[var(--surface-2)]',
                    ].join(' ')}
                  >
                    <span
                      className="shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] text-white"
                      style={{
                        background: checked ? 'var(--accent)' : 'transparent',
                        borderColor: checked ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <span className="text-[13px] text-primary truncate">{o.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
