import { useState, useRef } from 'react'
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineCloudArrowUp,
} from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useCurrenciesCertStore, {
  selectActiveTab,
  selectIsFlightComplete,
  selectIsCurrencyComplete,
  selectIsTaskAssocComplete,
  selectIsFlightPackAssocComplete,
  selectIsCertificateComplete,
} from './store'

type SubTab = 'flight' | 'currencies' | 'taskAssociation' | 'certificate' | 'flightPackAssociation'

const TAB_ORDER: SubTab[] = ['flight', 'currencies', 'taskAssociation', 'certificate', 'flightPackAssociation']

interface CurrenciesCertFooterProps {
  onSelectCertFile: (file: File) => Promise<void>
  hasWrite: boolean
  onSaveDraft: () => void
  onSaveAndClose: () => void
  onClose: () => void
  isSaving: boolean
  savingTab: string | null
  isSavingDraft?: boolean
  onPrev: () => void
  onNext: () => void
  hideFormActions: boolean
  includeFlight?: boolean
  includeTaskAssociation?: boolean
  includeFlightPackAssociation?: boolean
}

export default function CurrenciesCertFooter({
  onSelectCertFile,
  hasWrite,
  onSaveDraft,
  onSaveAndClose,
  onClose,
  isSaving,
  savingTab,
  isSavingDraft,
  onPrev,
  onNext,
  hideFormActions,
  includeFlight = true,
  includeTaskAssociation = true,
  includeFlightPackAssociation = true,
}: CurrenciesCertFooterProps) {
  const { t } = useI18n()
  const activeTab = useCurrenciesCertStore(selectActiveTab)
  const flightComplete = useCurrenciesCertStore(selectIsFlightComplete)
  const currenciesComplete = useCurrenciesCertStore(selectIsCurrencyComplete)
  const taskAssocComplete = useCurrenciesCertStore(selectIsTaskAssocComplete)
  const fpaComplete = useCurrenciesCertStore(selectIsFlightPackAssocComplete)
  const certificateComplete = useCurrenciesCertStore(selectIsCertificateComplete)
  const tabs: SubTab[] = [
    ...(includeFlight ? (['flight'] as SubTab[]) : []),
    'currencies',
    ...(includeTaskAssociation ? (['taskAssociation'] as SubTab[]) : []),
    'certificate',
    ...(includeFlightPackAssociation ? (['flightPackAssociation'] as SubTab[]) : []),
  ]
  const currentIndex = tabs.indexOf(activeTab)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < tabs.length - 1
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const tabComplete = activeTab === 'flight'
    ? flightComplete
    : activeTab === 'currencies'
      ? currenciesComplete
      : activeTab === 'taskAssociation'
        ? taskAssocComplete
        : activeTab === 'flightPackAssociation'
          ? fpaComplete
          : certificateComplete

  return (
    <footer
      className="flex items-center gap-5 px-5 bg-[var(--surface)] border-t border-[var(--border)] sticky bottom-0 z-10"
      style={{ height: 64, boxShadow: '0 -1px 0 rgba(0,0,0,0.04), 0 -8px 16px -8px rgba(0,0,0,0.06)' }}
    >
      {/* Zone 1: Tab navigation */}
      <div className="flex items-center gap-2" role="group" aria-label="Tab navigation">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev || isSaving}
          title="Previous tab"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[var(--text-muted)] text-[13px] font-medium transition-[background-color,color] duration-[120ms] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <HiOutlineChevronLeft className="w-4 h-4 flex-none" />
          {t('courseManagement.currenciesCert.common.previous')}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext || isSaving}
          title="Next tab"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[var(--text-muted)] text-[13px] font-medium transition-[background-color,color] duration-[120ms] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('courseManagement.currenciesCert.common.next')}
          <HiOutlineChevronRight className="w-4 h-4 flex-none" />
        </button>

        {activeTab === 'certificate' && hasWrite && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving || uploading || certificateComplete}
              title="Upload certificate"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[var(--text-muted)] text-[13px] font-medium transition-[background-color,color] duration-[120ms] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? <Spinner /> : <HiOutlineCloudArrowUp className="w-4 h-4 flex-none" />}
              {uploading ? t('courseManagement.currenciesCert.certificate.uploading') : t('courseManagement.currenciesCert.certificate.upload')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                if (file.type !== 'application/pdf') {
                  alert(t('courseManagement.currenciesCert.common.pdfAlert'))
                  return
                }
                setUploading(true)
                try {
                  await onSelectCertFile(file)
                } finally {
                  setUploading(false)
                  e.target.value = ''
                }
              }}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Zone 2: Form actions */}
      <div className="flex items-center gap-2" role="group" aria-label="Form actions">
        <button
          type="button"
          onClick={onClose}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[var(--text-muted)] text-[13px] font-medium transition-[background-color,color] duration-[120ms] hover:bg-[#fef3f2] hover:text-[#b42318] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('courseManagement.currenciesCert.common.close')}
        </button>

        {!hideFormActions && hasWrite && !tabComplete && (
          <>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[13px] font-medium transition-[background-color] duration-[120ms] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSavingDraft && <Spinner />}
              {t('courseManagement.currenciesCert.common.saveDraft')}
            </button>

            <button
              type="button"
              onClick={onSaveAndClose}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--accent)] border border-[var(--accent)] text-white text-[13px] font-medium transition-[opacity] duration-[120ms] hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ boxShadow: '0 1px 2px rgba(6,85,92,0.25)' }}
            >
              {isSavingDraft && <Spinner />}
              {t('courseManagement.currenciesCert.common.save')}
            </button>
          </>
        )}
      </div>
    </footer>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 flex-none" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
      <path className="opacity-75" fill="currentColor" d="M8 2a6 6 0 0 1 6 6h-2a4 4 0 0 0-4-4V2z" />
    </svg>
  )
}
