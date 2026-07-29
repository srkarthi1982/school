import type { CurrencyItem } from '../course-info/api'
import { HiOutlineTrash } from 'react-icons/hi2'
import { HiOutlineSearch } from 'react-icons/hi'
import {useEffect, useState} from 'react'
import { useI18n } from '../../../infra/locales/I18nContext'
import useCurrenciesCertStore, {
  selectSelectedCurrencyIds,
  selectAvailableCurrencies,
  selectSelectCurrency,
} from './store'
import useFullBleedStore from "../../../infra/shared/store/useFullBleedStore.ts";

export default function CurrenciesTab({ availableCurrencies, isComplete }: {
  availableCurrencies: CurrencyItem[]
  isComplete: boolean
}) {
  const { t } = useI18n()
  const selectedCurrencyIds = useCurrenciesCertStore(selectSelectedCurrencyIds)
  const selectCurrency = useCurrenciesCertStore(selectSelectCurrency)
  const removeCurrency = useCurrenciesCertStore(state => state.removeCurrency)

  const [availSearch, setAvailSearch] = useState('')
  const [selSearch, setSelSearch] = useState('')
  const [showAvailSearch, setShowAvailSearch] = useState(false)
  const [showSelSearch, setShowSelSearch] = useState(false)

  const handleToggle = (id: number) => {
    const isSelected = selectedCurrencyIds.includes(id)
    if (isSelected) {
      removeCurrency(id)
    } else {
      selectCurrency(id)
    }
  }

  const handleRemove = (id: number) => {
    removeCurrency(id)
  }

  const filteredAvailable = availableCurrencies.filter((c) =>
    c.name.toLowerCase().includes(availSearch.toLowerCase())
  )

  const filteredSelected = selectedCurrencyIds
    .filter((id) => {
      const currency = availableCurrencies.find((c) => c.id === id)
      return currency?.name.toLowerCase().includes(selSearch.toLowerCase())
    })

  if (!availableCurrencies || availableCurrencies.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted text-[13px]">
        {t('courseManagement.currenciesCert.common.noDataLoaded')}
      </div>
    )
  }

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  return (
    <div className="grid grid-rows-[auto_1fr] h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] px-6 pt-4">
        <div>
          <h2 className="text-[18px] font-bold text-primary">{t('courseManagement.currenciesCert.currencies.title')}</h2>
          <p className="text-[12px] text-muted mt-0.5">
            {t('courseManagement.currenciesCert.currencies.description')}
          </p>
        </div>
      </div>

      {/* Three-column content */}
      <div className="grid grid-cols-[1fr_1fr_140px] gap-6 px-6 py-4 overflow-y-auto thin-scrollbar-light items-start">
        {/* Available Currencies */}
        <div className="flex flex-col gap-1.5 min-h-0">
          <div className="flex items-center justify-between gap-2" style={{ height: 34 }}>
            <h3 className="text-[14px] font-bold text-primary shrink-0">{t('courseManagement.currenciesCert.currencies.available')}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {showAvailSearch && (
                <input
                  type="text"
                  placeholder={t('courseManagement.currenciesCert.currencies.search')}
                  value={availSearch}
                  onChange={(e) => setAvailSearch(e.target.value)}
                  className="w-56 pl-3 pr-3 py-1.5 rounded-[8px] border border-[var(--border)] text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:border-opacity-50"
                />
              )}
              <button
                type="button"
                onClick={() => setShowAvailSearch(!showAvailSearch)}
                className={`shrink-0 p-1.5 rounded-[8px] border cursor-pointer transition-colors ${
                  showAvailSearch
                    ? 'border-accent text-accent bg-accent-light/10'
                    : 'border-[var(--border)] text-muted hover:bg-surface-2'
                }`}
              >
                <HiOutlineSearch className="text-[14px]" />
              </button>
            </div>
          </div>
              <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto thin-scrollbar-light">
                {filteredAvailable.length === 0 ? (
                  <p className="text-[12px] text-muted py-4 text-center">{t('courseManagement.currenciesCert.currencies.noFound')}</p>
                ) : (
                  filteredAvailable.map((currency) => {
                    const isSelected = selectedCurrencyIds.includes(currency.id)
                    return (
                      <label
                        key={currency.id}
                        className={`flex items-center justify-between gap-2 px-3 rounded-[8px] transition-colors ${
                          isSelected ? 'hover:bg-opacity-80' : 'hover:bg-surface-2'
                        }`}
                        style={{
                          height: 36,
                          cursor: 'pointer',
                          ...(isSelected
                            ? { border: '1px solid rgba(6,85,92,0.2)', background: 'var(--accent-light)' }
                            : { border: '1px solid rgba(0,0,0,0.08)' }),
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggle(currency.id)}
                            className="w-4 h-4 rounded border-[var(--border)] text-accent focus:ring-accent cursor-pointer flex-shrink-0"
                            disabled={isComplete}
                          />
                          <span className="text-[13px] font-semibold text-primary truncate">
                            {currency.name}
                          </span>
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
        </div>

        {/* Selected Currencies */}
        <div className="flex flex-col gap-1.5 min-h-0">
          <div className="flex items-center justify-between gap-2" style={{ height: 34 }}>
            <h3 className="text-[14px] font-bold text-primary">
              {t('courseManagement.currenciesCert.currencies.selected')}
              {filteredSelected.length > 0 && (
                <span className="ml-1.5 text-[11px] text-muted">({filteredSelected.length})</span>
              )}
            </h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {showSelSearch && (
                <input
                  type="text"
                  placeholder={t('courseManagement.currenciesCert.currencies.search')}
                  value={selSearch}
                  onChange={(e) => setSelSearch(e.target.value)}
                  className="w-56 pl-3 pr-3 py-1.5 rounded-[8px] border border-[var(--border)] text-[13px] text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:border-opacity-50"
                />
              )}
              <button
                type="button"
                onClick={() => setShowSelSearch(!showSelSearch)}
                className={`shrink-0 p-1.5 rounded-[8px] border cursor-pointer transition-colors ${
                  showSelSearch
                    ? 'border-accent text-accent bg-accent-light/10'
                    : 'border-[var(--border)] text-muted hover:bg-surface-2'
                }`}
              >
                <HiOutlineSearch className="text-[14px]" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto thin-scrollbar-light">
            {filteredSelected.length === 0 ? (
              <p className="text-[12px] text-muted py-4 text-center">{t('courseManagement.currenciesCert.currencies.noSelected')}</p>
            ) : (
              filteredSelected.map((id) => {
                const currency = availableCurrencies.find((c) => c.id === id)
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-2 px-3 rounded-[8px]"
                    style={{ border: '1px solid rgba(6,85,92,0.2)', background: 'var(--accent-light)', height: 36 }}
                  >
                    <span className="text-[13px] font-semibold text-primary truncate mr-2 flex-1 min-w-0">
                      {currency?.name ?? t('courseManagement.currenciesCert.common.currencyUnidentified').replace('#{id}', String(id))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(id)}
                      className="text-[11px] text-muted hover:text-[#DC2626] bg-transparent border-none cursor-pointer p-0 shrink-0"
                      title={t('courseManagement.currenciesCert.currencies.remove')}
                      disabled={isComplete}
                    >
                      <HiOutlineTrash className="text-[14px]" />
                    </button>
                  </div>

                )
              })
            )}
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1.5 min-h-0">
          <div style={{ height: 34 }}>
            <h3 className="text-[14px] font-bold text-primary">{t('courseManagement.currenciesCert.currencies.status')}</h3>
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto thin-scrollbar-light">
            {filteredSelected.length > 0 ? (
              filteredSelected.map((id) => {
                const currency = availableCurrencies.find((c) => c.id === id)
                const badgeColor = { bg: 'rgba(34,197,94,0.12)', text: '#16A34A' }
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-2 px-3 rounded-[8px] hover:bg-surface-2"
                    style={{ border: '1px solid rgba(6,85,92,0.2)', background: 'var(--accent-light)', height: 36 }}
                  >
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                      style={{ background: badgeColor.bg, color: badgeColor.text }}
                    >
                      {badgeColor.text === '#16A34A' ? t('courseManagement.currenciesCert.common.statusGreen') : t('courseManagement.currenciesCert.common.statusRed')}
                    </span>
                  </div>
                )
              })
            ) : (
              <p className="text-[11px] text-muted py-4 text-center">{t('courseManagement.currenciesCert.currencies.noStatus')}</p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
