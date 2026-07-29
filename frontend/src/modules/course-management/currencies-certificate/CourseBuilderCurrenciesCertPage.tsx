import { useCallback, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HiOutlineDocumentText, HiOutlineArrowLeft } from 'react-icons/hi2'
import {
  saveMasterCourseCurrencies,
  uploadCertificate,
  markCurrenciesCertComplete,
  unmarkCurrenciesCertComplete,
  saveFlightPackages,
  markFlightPackageComplete,
  unmarkFlightPackageComplete,
  saveTaskAssociations,
  markTaskAssociationComplete,
  unmarkTaskAssociationComplete,
  saveFlightPackAssociations,
  markFlightPackAssociationComplete,
  unmarkFlightPackAssociationComplete,
} from './currencies-cert-api'
import { useToast } from '../../../infra/shared/store/useToastStore'
import { useI18n } from '../../../infra/locales/I18nContext'
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'
import { canAccess } from '../../../infra/shared/utils/menuUtils'
import { confirmDialog } from '../../../infra/shared/store/useConfirmStore'
import CurrenciesTab from './CurrenciesTab'
import CertificateTab from './CertificateTab'
import FlightPackageTab from './FlightPackageTab'
import TaskAssociationTab from './TaskAssociationTab'
import FlightPackAssociationTab from './FlightPackAssociationTab'
import CurrenciesCertFooter from './CurrenciesCertFooter'
import TabBar from './TabBar'
import Breadcrumb, { courseCategoryCrumbs } from '../_shared/Breadcrumb'
import useCurrenciesCertStore, {
  selectLoading,
  selectError,
  selectSavingTab,
  selectTogglingTab,
  selectIsComplete,
  selectSetActiveTab,
  selectIsFlightComplete,
  selectIsCurrencyComplete,
  selectIsTaskAssocComplete,
  selectIsCertificateComplete,
  selectIsFlightPackAssocComplete,
  selectActiveTab,
  selectSelectedCurrencyIds,
  selectAvailableCurrencies,
  selectCourseTitle,
  selectMasterApproved,
  selectSelectCurrency,
  selectRemoveCurrency,
} from './store'

type SubTab = 'flight' | 'currencies' | 'taskAssociation' | 'certificate' | 'flightPackAssociation'

const TAB_ORDER: SubTab[] = ['flight', 'currencies', 'taskAssociation', 'certificate', 'flightPackAssociation']

const COMPLETE_MSG = 'courseManagement.currenciesCert.common.completed'
const INCOMPLETE_MSG = 'courseManagement.currenciesCert.common.incomplete'
const FAILED_SAVE_MSG = 'courseManagement.currenciesCert.common.failedSave'
const DRAFT_SAVED_MSG = 'courseManagement.currenciesCert.common.draftSaved'
const FAILED_UPLOAD_MSG = 'courseManagement.currenciesCert.common.failedUpload'

const MASTER_APPROVED_LOCK = 'Course is approved. This tab is locked and cannot be unmarked.'
const FLIGHT_MARKED_COMPLETE = 'Flight Package tab is marked complete. Unmark to make changes.'
const CURRENCY_MARKED_COMPLETE = 'Currencies tab is marked complete. Unmark to make changes.'
const TASK_ASSOC_MARKED_COMPLETE = 'Task Association tab is marked complete. Unmark to make changes.'
const FPA_MARKED_COMPLETE = 'Flight Pack Association tab is marked complete. Unmark to make changes.'
const CERT_MARKED_COMPLETE = 'Certificate tab is marked complete. Unmark to make changes.'
const FLIGHT_ADD = 'Add flight packages and their tasks, then mark this tab complete.'
const CURRENCY_SELECT = 'Select currencies to view their status, then mark this tab complete.'
const TASK_ASSOC_ADD = 'Associate tasks with enabling objectives and currencies, then mark this tab complete.'
const FPA_ADD = 'Associate flight packages with lessons, then mark this tab complete.'
const CERT_UPLOAD = 'Upload a certificate PDF, then mark this tab complete.'

export default function CourseBuilderCurrenciesCertPage() {
  const { id } = useParams<{ id: string }>()
  const masterId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useI18n()
  const permissions = useAuthStore(selectUserPermissions)
  const hasWrite = canAccess({ permissions: ['currencies_certificate:write'] }, permissions)
  const detailPath = masterId ? `/course-management/course-builder/${masterId}` : '/'

  // All hooks must be at the top, before any conditional returns
  const storeLoading = useCurrenciesCertStore(selectLoading)
  const storeError = useCurrenciesCertStore(selectError)
  const storeSavingTab = useCurrenciesCertStore(selectSavingTab)
  const storeTogglingTab = useCurrenciesCertStore(selectTogglingTab)
  const isComplete = useCurrenciesCertStore(state => state.isComplete)
  const activeTab = useCurrenciesCertStore(selectActiveTab)
  const isFlightComplete = useCurrenciesCertStore(selectIsFlightComplete)
  const isCurrencyComplete = useCurrenciesCertStore(selectIsCurrencyComplete)
  const isTaskAssocComplete = useCurrenciesCertStore(selectIsTaskAssocComplete)
  const isCertComplete = useCurrenciesCertStore(selectIsCertificateComplete)
  const isFpaComplete = useCurrenciesCertStore(selectIsFlightPackAssocComplete)
  const availableCurrencies = useCurrenciesCertStore(selectAvailableCurrencies)
  const overallProgress = useCurrenciesCertStore(state => state.overallProgress)
  const tabsCompleted = useCurrenciesCertStore(state => state.tabsCompleted)

  const prevSelectedRef = useRef<number[]>([])
  const pendingBackupIdsRef = useRef<number[]>([])

  const setSelectedCurrencyIds = useCurrenciesCertStore(state => state.setSelectedCurrencyIds)
  const setPendingFile = useCurrenciesCertStore(state => state.setPendingFile)
  const setSavingTab = useCurrenciesCertStore(state => state.setSavingTab)
  const setTogglingTab = useCurrenciesCertStore(state => state.setTogglingTab)
  const setCompletionStatus = useCurrenciesCertStore(state => state.setCompletionStatus)

  const selectCurrency = useCurrenciesCertStore(selectSelectCurrency)
  const setActiveTab = useCurrenciesCertStore(state => state.setActiveTab)
  const removeCurrency = useCurrenciesCertStore(selectRemoveCurrency)

  // Load initial data on mount
  useEffect(() => {
    if (!Number.isFinite(masterId)) {
      useCurrenciesCertStore.getState().setError('Invalid course master id')
      useCurrenciesCertStore.getState().setLoading(false)
      return
    }
    useCurrenciesCertStore.getState().init(masterId)
  }, [masterId])

  const handleSelectCurrencies = useCallback((selectedIds: number[]) => {
    const { selectedCurrencyIds } = useCurrenciesCertStore.getState()
    const prev = prevSelectedRef.current

    // Clear confirmation flow
    if (prev.length > 0 && selectedIds.length === 0) {
      pendingBackupIdsRef.current = [...selectedCurrencyIds]
      useCurrenciesCertStore.getState().setSelectedCurrencyIds([])

      confirmDialog({
        title: 'courseManagement.currenciesCert.currencies.confirmClearSelection',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        tone: 'danger',
      }).then((confirmed) => {
        if (!confirmed) {
          useCurrenciesCertStore.getState().setSelectedCurrencyIds(pendingBackupIdsRef.current)
        } else {
          prevSelectedRef.current = []
        }
        pendingBackupIdsRef.current = []
      })
      return
    }

    useCurrenciesCertStore.getState().setSelectedCurrencyIds(selectedIds)
    prevSelectedRef.current = [...selectedIds]
  }, [])

  const handleFileUpload = useCallback(async (file: File) => {
    setPendingFile(file)
  }, [setPendingFile])

  const persistPendingCertificate = useCallback(async () => {
    const { pendingFile } = useCurrenciesCertStore.getState()
    if (!pendingFile) return
    try {
      const res = await uploadCertificate(masterId, pendingFile)
      if (res.certificateUrl) {
        useCurrenciesCertStore.getState().setCertificateUrl(res.certificateUrl)
        useCurrenciesCertStore.getState().setPendingFile(null)
      }
    } catch {
      toast.error({ title: t(FAILED_UPLOAD_MSG) })
    }
  }, [masterId, toast, t])

  const persistFlightPackages = useCallback(async () => {
    const { flightPackages } = useCurrenciesCertStore.getState()
    const saved = await saveFlightPackages(masterId, flightPackages)
    useCurrenciesCertStore.getState().setFlightPackages(saved)
  }, [masterId])

  // Task associations reference this course's flight-package tasks, so the
  // packages must be persisted first for the backend validation to pass.
  const persistTaskAssociations = useCallback(async () => {
    const { taskAssociations } = useCurrenciesCertStore.getState()
    const valid = taskAssociations.filter((a) => a.task_master_id !== 0)
    const saved = await saveTaskAssociations(masterId, valid)
    useCurrenciesCertStore.getState().setTaskAssociations(saved)
  }, [masterId])

  const persistFlightPackAssociations = useCallback(async () => {
    const { fpaAssociations } = useCurrenciesCertStore.getState()
    const valid = fpaAssociations.filter((a) => a.package_id !== 0)
    const saved = await saveFlightPackAssociations(masterId, valid)
    useCurrenciesCertStore.getState().setFpaAssociations(saved)
  }, [masterId])

  const handleSave = useCallback(async () => {
    await persistPendingCertificate()
    await persistFlightPackages()
    await persistTaskAssociations()
    await persistFlightPackAssociations()
    const { selectedCurrencyIds } = useCurrenciesCertStore.getState()
    if (selectedCurrencyIds.length > 0) {
      await saveMasterCourseCurrencies(masterId, selectedCurrencyIds)
    }
  }, [masterId, persistPendingCertificate, persistFlightPackages, persistTaskAssociations])

  const handleSaveDraft = useCallback(async () => {
    if (!masterId) return
    setSavingTab('draft')
    try {
      await handleSave()
      toast.success({ title: t(DRAFT_SAVED_MSG) })
    } catch {
      toast.error({ title: t(FAILED_SAVE_MSG) })
    } finally {
      setSavingTab(null)
    }
  }, [masterId, handleSave, toast, t])

  const handleSaveAndClose = useCallback(async () => {
    try {
      await handleSave()
    } catch {
      toast.error({ title: t(FAILED_SAVE_MSG) })
    }
    navigate(detailPath)
  }, [handleSave, navigate, t])

  const handleSaveCurrentTab = useCallback(async (tabNo: SubTab) => {
    if (tabNo === 'flight') {
      await persistFlightPackages()
    } else if (tabNo === 'taskAssociation') {
      await persistFlightPackages()
      await persistTaskAssociations()
    } else if (tabNo === 'flightPackAssociation') {
      await persistFlightPackages()
      await persistFlightPackAssociations()
    } else if (tabNo === 'certificate') {
      await persistPendingCertificate()
    } else {
      const { selectedCurrencyIds } = useCurrenciesCertStore.getState()
      if (selectedCurrencyIds.length > 0) {
        await saveMasterCourseCurrencies(masterId, selectedCurrencyIds)
      }
    }
  }, [masterId, persistPendingCertificate, persistFlightPackages, persistTaskAssociations, persistFlightPackAssociations])

  const setFlightCompletion = useCurrenciesCertStore(state => state.setFlightCompletion)
  const setTaskAssociationCompletion = useCurrenciesCertStore(state => state.setTaskAssociationCompletion)
  const setFpaCompletion = useCurrenciesCertStore(state => state.setFpaCompletion)

  const handleToggleStatus = useCallback(async (tabNo: SubTab) => {
    if (!masterId) return
    setTogglingTab(tabNo)
    try {
      const state = useCurrenciesCertStore.getState()
      const isCurrentComplete = tabNo === 'flight'
        ? state.isFlightComplete
        : tabNo === 'currencies'
          ? state.isCurrencyComplete
          : tabNo === 'taskAssociation'
            ? state.isTaskAssocComplete
            : tabNo === 'flightPackAssociation'
              ? state.fpaComplete ?? false
              : state.isCertComplete

      // Persist the tab's data before marking it complete.
      if (!isCurrentComplete) {
        if (tabNo === 'flight') {
          await persistFlightPackages()
        } else if (tabNo === 'taskAssociation') {
          await persistFlightPackages()
          await persistTaskAssociations()
        } else if (tabNo === 'flightPackAssociation') {
          await persistFlightPackages()
          await persistFlightPackAssociations()
        } else if (tabNo === 'currencies') {
          const selIds = useCurrenciesCertStore.getState().selectedCurrencyIds
          if (selIds.length > 0) {
            await saveMasterCourseCurrencies(masterId, selIds)
          }
        } else {
          await persistPendingCertificate()
        }
      }

      if (tabNo === 'flight') {
        const resp = isCurrentComplete
          ? await unmarkFlightPackageComplete(masterId)
          : await markFlightPackageComplete(masterId)
        setFlightCompletion(resp.flight_package_completion)
      } else if (tabNo === 'taskAssociation') {
        const resp = isCurrentComplete
          ? await unmarkTaskAssociationComplete(masterId)
          : await markTaskAssociationComplete(masterId)
        setTaskAssociationCompletion(resp.task_association_completion)
      } else if (tabNo === 'flightPackAssociation') {
        const resp = isCurrentComplete
          ? await unmarkFlightPackAssociationComplete(masterId)
          : await markFlightPackAssociationComplete(masterId)
        setFpaCompletion(resp.flight_pack_association_completion)
      } else {
        const resp = isCurrentComplete
          ? await unmarkCurrenciesCertComplete(masterId, tabNo as 'currencies' | 'certificate')
          : await markCurrenciesCertComplete(masterId, tabNo as 'currencies' | 'certificate')
        setCompletionStatus(resp.currencies_certificate_completion)
      }

      if (isCurrentComplete) {
        toast.success({ title: t(INCOMPLETE_MSG) })
      } else {
        toast.success({ title: t(COMPLETE_MSG) })
      }
    } catch {
      toast.error({ title: t(FAILED_SAVE_MSG) })
    } finally {
      setTogglingTab(null)
    }
  }, [masterId, persistPendingCertificate, persistFlightPackages, persistTaskAssociations, persistFlightPackAssociations, setFlightCompletion, setTaskAssociationCompletion, setFpaCompletion, toast, t])

  // ── Render ──

  if (storeLoading) {
    return <div className="p-6 text-sm text-muted">{t('courseManagement.currenciesCert.common.loading')}</div>
  }

  if (storeError) {
    return (
      <div className="px-6 py-4">
        <button
          onClick={() => navigate(detailPath)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          {t('courseManagement.currenciesCert.common.backToCourseBuilder')}
        </button>
        <div className="text-sm text-red-500">{storeError}</div>
      </div>
    )
  }

  const progressLabel = 'courseManagement.currenciesCert.common.overallProgress'
  const tabsLabel = 'courseManagement.currenciesCert.common.tabs'

  return (
    <div className="flex flex-col h-full min-h-0">
      <CurrenciesCertHeader detailPath={detailPath} />
      <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--surface)]">
        <span className="text-[11px] font-bold text-muted tracking-[0.06em] uppercase shrink-0">
          {t(progressLabel)}
        </span>
        <div className="flex-1 progress-track">
          <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
        </div>
        <span className="text-[11.5px] font-bold text-accent shrink-0">{overallProgress}%</span>
        <span className="text-[11px] text-muted shrink-0">
          {tabsCompleted} {t(tabsLabel)}
        </span>
      </div>
      <TabBar />
      <StatusBanner
        hasWrite={hasWrite}
        isToggling={storeTogglingTab !== null}
        onToggle={handleToggleStatus}
      />
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar-light bg-[var(--surface)]">
        {activeTab === 'flight' ? (
          <FlightPackageTab isComplete={isFlightComplete} />
        ) : activeTab === 'currencies' ? (
          <CurrenciesTab
            availableCurrencies={availableCurrencies}
            isComplete={isCurrencyComplete}
          />
        ) : activeTab === 'taskAssociation' ? (
          <TaskAssociationTab isComplete={isTaskAssocComplete} />
        ) : activeTab === 'flightPackAssociation' ? (
          <FlightPackAssociationTab isComplete={isFpaComplete} />
        ) : (
          <CertificateTab />
        )}
      </div>
      <CurrenciesCertFooter
        onSelectCertFile={handleFileUpload}
        hasWrite={hasWrite}
        onSaveDraft={handleSaveDraft}
        onSaveAndClose={handleSaveAndClose}
        onClose={() => navigate(detailPath)}
        isSaving={storeSavingTab !== null}
        savingTab={storeSavingTab}
        isSavingDraft={storeSavingTab === 'draft'}
        onPrev={() => {
          const current = useCurrenciesCertStore.getState().activeTab
          handleSaveCurrentTab(current)
          const prev = TAB_ORDER[TAB_ORDER.indexOf(current) - 1]
          if (prev) setActiveTab(prev)
        }}
        onNext={() => {
          const current = useCurrenciesCertStore.getState().activeTab
          handleSaveCurrentTab(current)
          const next = TAB_ORDER[TAB_ORDER.indexOf(current) + 1]
          if (next) setActiveTab(next)
        }}
        hideFormActions={isComplete}
      />
    </div>
  )
}

function CurrenciesCertHeader({ detailPath }: { detailPath: string }) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const courseTitle = useCurrenciesCertStore(state => state.courseTitle)
  const isComplete = useCurrenciesCertStore(state => state.isComplete)
  const overallProgress = useCurrenciesCertStore(state => state.overallProgress)
  const listPath = '/course-management/course-builder'
  const completeMsg = 'courseManagement.currenciesCert.common.completed'
  const incompleteMsg = 'courseManagement.currenciesCert.common.incomplete'
  const backLabel = 'courseManagement.currenciesCert.common.back'
  const titleLabel = 'courseManagement.currenciesCert.title'
  const statusLabel = 'courseManagement.currenciesCert.common.status'

  return (
    <>
      <Breadcrumb
        items={courseCategoryCrumbs({
          scopeLabel: 'Course Builder',
          listPath,
          courseTitle,
          detailPath,
          categoryLabel: t(titleLabel),
        })}
      />
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(detailPath)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0"
          >
            <HiOutlineArrowLeft className="text-[14px]" />
            {t(backLabel)}
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em]">
            <HiOutlineDocumentText className="text-[11px]" />
            {t(titleLabel)}
          </div>
          {courseTitle && <span className="text-[15px] font-bold text-primary">{courseTitle}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-muted tracking-[0.06em] uppercase">{t(statusLabel)}</span>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{
              background: isComplete ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.12)',
              color: isComplete ? '#16A34A' : '#D97706',
            }}
          >
            {isComplete ? t(completeMsg) : t(incompleteMsg)}
          </span>
          <span className="text-[11px] font-bold text-muted ml-2">{overallProgress}%</span>
        </div>
      </div>
    </>
  )
}

function OverallProgressBar() {
  const { t } = useI18n()
  const overallProgress = useCurrenciesCertStore(state => state.overallProgress)
  const tabsCompleted = useCurrenciesCertStore(state => state.tabsCompleted)
  const progressLabel = 'courseManagement.currenciesCert.common.overallProgress'
  const tabsLabel = 'courseManagement.currenciesCert.common.tabs'

  return (
    <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--surface)]">
      <span className="text-[11px] font-bold text-muted tracking-[0.06em] uppercase shrink-0">
        {t(progressLabel)}
      </span>
      <div className="flex-1 progress-track">
        <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
      </div>
      <span className="text-[11.5px] font-bold text-accent shrink-0">{overallProgress}%</span>
      <span className="text-[11px] text-muted shrink-0">
        {tabsCompleted} {t(tabsLabel)}
      </span>
    </div>
  )
}

function StatusBanner({
  hasWrite,
  isToggling,
  onToggle,
}: {
  hasWrite: boolean
  isToggling: boolean
  onToggle: (tab: SubTab) => void
}) {
  const activeTab = useCurrenciesCertStore(state => state.activeTab)
  const isFlightComplete = useCurrenciesCertStore(state => state.isFlightComplete)
  const isCurrencyComplete = useCurrenciesCertStore(state => state.isCurrencyComplete)
  const isTaskAssocComplete = useCurrenciesCertStore(state => state.isTaskAssocComplete)
  const isCertComplete = useCurrenciesCertStore(state => state.isCertComplete)
  const isFlightPackAssocComplete = useCurrenciesCertStore(state => state.fpaComplete ?? false)
  const masterApproved = useCurrenciesCertStore(state => state.masterApproved)
  const { t } = useI18n()

  const currentTabComplete = activeTab === 'flight'
    ? isFlightComplete
    : activeTab === 'currencies'
      ? isCurrencyComplete
      : activeTab === 'taskAssociation'
        ? isTaskAssocComplete
        : activeTab === 'flightPackAssociation'
          ? isFlightPackAssocComplete
          : isCertComplete
  const statusMessage = getStatusMessage(activeTab, currentTabComplete, masterApproved)
  const completeMsg = 'courseManagement.currenciesCert.common.completed'
  const incompleteMsg = 'courseManagement.currenciesCert.common.incomplete'

  return (
    hasWrite ? (
      <div
        className="flex items-center justify-between gap-3 px-6 py-3 border-b border-[var(--border)]"
        style={{ background: currentTabComplete ? 'rgba(34,197,94,0.06)' : 'var(--surface-2)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{
              background: currentTabComplete ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
              color: currentTabComplete ? '#16A34A' : '#D97706',
            }}
          >
            {currentTabComplete
              ? t(completeMsg)
              : t(incompleteMsg)}
          </span>
          <span className="text-[12.5px] text-muted">{statusMessage}</span>
        </div>
        {!(masterApproved && currentTabComplete) && (
          <button
            type="button"
            onClick={() => onToggle(activeTab)}
            disabled={isToggling}
            className="px-3 py-1.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-semibold cursor-pointer hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
          >
            {isToggling ? '' : (currentTabComplete ? 'Unmark Complete' : 'Mark Complete')}
          </button>
        )}
      </div>
    ) : null
  )
}

function getStatusMessage(
  activeTab: SubTab,
  currentTabComplete: boolean,
  masterApproved: boolean,
): string {
  if (masterApproved && currentTabComplete) return MASTER_APPROVED_LOCK
  if (activeTab === 'flight') {
    if (currentTabComplete) return FLIGHT_MARKED_COMPLETE
    return FLIGHT_ADD
  }
  if (activeTab === 'currencies') {
    if (currentTabComplete) return CURRENCY_MARKED_COMPLETE
    return CURRENCY_SELECT
  }
  if (activeTab === 'taskAssociation') {
    if (currentTabComplete) return TASK_ASSOC_MARKED_COMPLETE
    return TASK_ASSOC_ADD
  }
  if (activeTab === 'flightPackAssociation') {
    if (currentTabComplete) return FPA_MARKED_COMPLETE
    return FPA_ADD
  }
  if (currentTabComplete) return CERT_MARKED_COMPLETE
  return CERT_UPLOAD
}
