import { useI18n } from '../../../infra/locales/I18nContext'
import useCurrenciesCertStore, {
  selectActiveTab,
  selectIsFlightComplete,
  selectIsCurrencyComplete,
  selectIsTaskAssocComplete,
  selectIsCertificateComplete,
  selectIsFlightPackAssocComplete,
  selectSetActiveTab,
} from './store'

type SubTab = 'flight' | 'currencies' | 'taskAssociation' | 'certificate' | 'flightPackAssociation'

export default function TabBar({
  includeFlight = true,
  includeTaskAssociation = true,
  includeFlightPackAssociation = true,
}: { includeFlight?: boolean; includeTaskAssociation?: boolean; includeFlightPackAssociation?: boolean }) {
  const { t } = useI18n()
  const activeTab = useCurrenciesCertStore(selectActiveTab)
  const flightComplete = useCurrenciesCertStore(selectIsFlightComplete)
  const currenciesComplete = useCurrenciesCertStore(selectIsCurrencyComplete)
  const taskAssocComplete = useCurrenciesCertStore(selectIsTaskAssocComplete)
  const fpaComplete = useCurrenciesCertStore(selectIsFlightPackAssocComplete)
  const certificateComplete = useCurrenciesCertStore(selectIsCertificateComplete)
  const setActiveTab = useCurrenciesCertStore(selectSetActiveTab)

  const tabs = [
    ...(includeFlight
      ? [{ key: 'flight' as const, label: t('courseManagement.currenciesCert.flightPackage.title'), isComplete: flightComplete }]
      : []),
    { key: 'currencies' as const, label: t('courseManagement.currenciesCert.currencies.title'), isComplete: currenciesComplete },
    ...(includeTaskAssociation
      ? [{ key: 'taskAssociation' as const, label: t('courseManagement.currenciesCert.taskAssociation.title'), isComplete: taskAssocComplete }]
      : []),
    { key: 'certificate' as const, label: t('courseManagement.currenciesCert.certificate.title'), isComplete: certificateComplete },
    ...(includeFlightPackAssociation
      ? [{ key: 'flightPackAssociation' as const, label: t('courseManagement.currenciesCert.flightPackAssociation.title'), isComplete: fpaComplete }]
      : []),
  ]

  const handleClick = (key: SubTab) => {
    setActiveTab(key)
  }

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleClick(tab.key)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none transition-all duration-150 cursor-pointer"
            style={{
              background: isActive ? 'var(--accent-light)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {tab.label}
            {tab.isComplete && (
              <span className="ml-0.5 w-2 h-2 rounded-full bg-[#16A34A] inline-block" />
            )}
          </button>
        )
      })}
    </div>
  )
}
