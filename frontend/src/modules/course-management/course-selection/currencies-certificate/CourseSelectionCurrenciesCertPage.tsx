import { useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HiOutlineDocumentText, HiOutlineArrowLeft } from 'react-icons/hi2'
import {
  getInstanceInfo,
  getAvailableCurrencies,
  getSelectedCurrencies,
  getCertificateUrl,
  saveSelectedCurrencies,
  uploadCertificate,
  markCurrenciesCertComplete,
  unmarkCurrenciesCertComplete,
  getFlightPackages,
  saveFlightPackages,
  markFlightPackageComplete,
  unmarkFlightPackageComplete,
  getTaskAssociations,
  saveTaskAssociations,
  markTaskAssociationComplete,
  unmarkTaskAssociationComplete,
  getEnablingObjectiveOptions,
  getFlightPackAssociations,
  saveFlightPackAssociations,
  markFlightPackAssociationComplete,
  unmarkFlightPackAssociationComplete,
  getFlightPackLessons,
  getAvailablePackagesForFpa,
} from './api'
import type { AvailableCurrencyItem, InstanceCurrencyRecord } from './api'
// The flight-task catalog is a global, shared list — reuse the master endpoint.
import { getFlightTaskMaster } from '../../currencies-certificate/currencies-cert-api'
import CurrenciesTab from '../../currencies-certificate/CurrenciesTab'
import CertificateTab from '../../currencies-certificate/CertificateTab'
import FlightPackageTab from '../../currencies-certificate/FlightPackageTab'
import TaskAssociationTab from '../../currencies-certificate/TaskAssociationTab'
import FlightPackAssociationTab from '../../currencies-certificate/FlightPackAssociationTab'
import CurrenciesCertFooter from '../../currencies-certificate/CurrenciesCertFooter'
import TabBar from '../../currencies-certificate/TabBar'
import useCurrenciesCertStore from '../../currencies-certificate/store'
import {
  isCurrenciesComplete,
  isCertificateComplete,
  isFlightComplete as computeFlightComplete,
  isTaskAssociationComplete,
  isFlightPackAssociationComplete,
  computeTabsProgress,
} from '../../currencies-certificate/currency-cert-config'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useAuthStore, { selectUserPermissions } from '../../../../infra/auth/useAuthStore'
import { canAccess } from '../../../../infra/shared/utils/menuUtils'
import Breadcrumb, { courseCategoryCrumbs } from '../../_shared/Breadcrumb'
import {
  selectLoading,
  selectError,
  selectSavingTab,
  selectTogglingTab,
  selectIsFlightComplete,
  selectIsCurrencyComplete,
  selectIsTaskAssocComplete,
  selectIsFlightPackAssocComplete,
  selectIsCertificateComplete,
  selectIsComplete,
  selectActiveTab,
  selectAvailableCurrencies,
  selectCourseTitle,
  selectMasterApproved,
  selectSelectCurrency,
  selectRemoveCurrency,
} from '../../currencies-certificate/store'

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
const FPA_ADD = 'Associate flight package tasks with lessons, then mark this tab complete.'
const CERT_UPLOAD = 'Upload a certificate PDF, then mark this tab complete.'

export default function CourseSelectionCurrenciesCertPage() {
  const { id } = useParams<{ id: string }>()
  const instanceId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useI18n()
  const permissions = useAuthStore(selectUserPermissions)
  const hasWrite = canAccess({ permissions: ['currencies_certificate:write'] }, permissions)
  const detailPath = instanceId ? `/course-management/course-selection/${instanceId}` : '/'

  // ── Subscribing to shared store via selectors ─
  const storeLoading = useCurrenciesCertStore(selectLoading)
  const storeError = useCurrenciesCertStore(selectError)
  const storeSavingTab = useCurrenciesCertStore(selectSavingTab)
  const storeTogglingTab = useCurrenciesCertStore(selectTogglingTab)
  const isFlightComplete = useCurrenciesCertStore(selectIsFlightComplete)
  const isCurrencyComplete = useCurrenciesCertStore(selectIsCurrencyComplete)
  const isTaskAssocComplete = useCurrenciesCertStore(selectIsTaskAssocComplete)
  const isFpaComplete = useCurrenciesCertStore(selectIsFlightPackAssocComplete)
  const isCertComplete = useCurrenciesCertStore(selectIsCertificateComplete)
  const isComplete = useCurrenciesCertStore(selectIsComplete)
  const activeTab = useCurrenciesCertStore(selectActiveTab)
  const availableCurrencies = useCurrenciesCertStore(selectAvailableCurrencies)
  const overallProgress = useCurrenciesCertStore(state => state.overallProgress)
  const tabsCompleted = useCurrenciesCertStore(state => state.tabsCompleted)
  const courseTitle = useCurrenciesCertStore(selectCourseTitle)
  const masterApproved = useCurrenciesCertStore(selectMasterApproved)

  const setActiveTab = useCurrenciesCertStore(state => state.setActiveTab)
  const setFlightCompletion = useCurrenciesCertStore(state => state.setFlightCompletion)
  const setTaskAssociationCompletion = useCurrenciesCertStore(state => state.setTaskAssociationCompletion)
  const setFpaCompletion = useCurrenciesCertStore(state => state.setFpaCompletion)
  const setCompletionStatus = useCurrenciesCertStore(state => state.setCompletionStatus)

  // ── Load instance data ─
  useEffect(() => {
    if (!Number.isFinite(instanceId)) {
      useCurrenciesCertStore.getState().setError('Invalid course id')
      useCurrenciesCertStore.getState().setLoading(false)
      return
    }
    ;(async () => {
      useCurrenciesCertStore.getState().setLoading(true)
      useCurrenciesCertStore.getState().setError(null)
      useCurrenciesCertStore.getState().setActiveTab('flight')
      try {
        // /info seeds atomically — guaranteed to return current completion state.
        const infoRes = await getInstanceInfo(instanceId)
        const [availRes, selRes, flightRes, taskMasterRes, taskAssocRes, eoRes, certRes] = await Promise.all([
          getAvailableCurrencies(instanceId),
          getSelectedCurrencies(instanceId),
          getFlightPackages(instanceId),
          getFlightTaskMaster(),
          getTaskAssociations(instanceId),
          getEnablingObjectiveOptions(instanceId),
          getCertificateUrl(instanceId),
        ])

        const completionStatus = infoRes.currencies_certificate_completion ?? 0
        const flightCompletion = infoRes.flight_package_completion ?? 0
        const taskAssociationCompletion = infoRes.task_association_completion ?? 0
        const flightDone = computeFlightComplete(flightCompletion)
        const curComplete = isCurrenciesComplete(completionStatus)
        const taskAssocDone = isTaskAssociationComplete(taskAssociationCompletion)
        const certComplete = isCertificateComplete(completionStatus)
        const fpaCompletion = infoRes.flight_pack_association_completion ?? 0
        const fpaDone = isFlightPackAssociationComplete(fpaCompletion)
        const { overallProgress: prog, tabsCompleted: tabs } = computeTabsProgress(
          flightDone, curComplete, taskAssocDone, certComplete, fpaDone,
        )

        useCurrenciesCertStore.setState({
          availableCurrencies: availRes.map((c: AvailableCurrencyItem) => ({ id: c.id, name: c.name })),
          selectedCurrencyIds: selRes.map((r: InstanceCurrencyRecord) => r.currency_master_id),
          prevSelectedIds: selRes.map((r: InstanceCurrencyRecord) => r.currency_master_id),
          flightPackages: flightRes,
          taskMaster: taskMasterRes,
          taskAssociations: taskAssocRes,
          eoOptions: eoRes,
          courseTitle: infoRes.course_title,
          completionStatus,
          flightCompletion,
          taskAssociationCompletion,
          fpaCompletion: fpaCompletion,
          masterApproved: infoRes.course_master_status === 'approved',
          isFlightComplete: flightDone,
          isCurrencyComplete: curComplete,
          isTaskAssocComplete: taskAssocDone,
          isCertComplete: certComplete,
          fpaComplete: fpaDone,
          fpaLoaded: false,
          fpaAssociations: [],
          fpaLessons: [],
          fpaPackageOptions: [],
          isComplete: flightDone && curComplete && taskAssocDone && certComplete && fpaDone,
          overallProgress: prog,
          tabsCompleted: tabs,
        })

        if (certRes.certificateUrl) {
          useCurrenciesCertStore.getState().setCertificateUrl(certRes.certificateUrl)
        }
      } catch (e: any) {
        useCurrenciesCertStore.getState().setError(e?.message || 'Failed to load data')
      } finally {
        useCurrenciesCertStore.getState().setLoading(false)
      }
    })()
  }, [instanceId])

  // ── Lazy load FPA data when user opens the FPA tab ──
  const fpaLoaded = useCurrenciesCertStore(state => state.fpaLoaded)

  useEffect(() => {
    if (activeTab !== 'flightPackAssociation' || fpaLoaded) return
    if (!Number.isFinite(instanceId)) return

    ;(async () => {
      try {
        const [fpaRes, lessonRes, fpaPkgRes] = await Promise.all([
          getFlightPackAssociations(instanceId),
          getFlightPackLessons(instanceId),
          getAvailablePackagesForFpa(instanceId),
        ])

        useCurrenciesCertStore.setState({
          fpaAssociations: fpaRes,
          fpaLessons: lessonRes,
          fpaPackageOptions: fpaPkgRes.map((p) => ({ id: p.package_id, label: p.package_name })),
          fpaLoaded: true,
        })
      } catch (e: any) {
        toast.error({ title: 'Failed to load FPA data' })
      }
    })()
  }, [activeTab, instanceId, fpaLoaded])

  const handleFileUpload = useCallback(async (file: File) => {
    useCurrenciesCertStore.getState().setPendingFile(file)
  }, [])

  const persistPendingCertificate = useCallback(async () => {
    const pf = useCurrenciesCertStore.getState().pendingFile
    if (!pf) return
    try {
      const res = await uploadCertificate(instanceId, pf)
      if (res.certificateUrl) {
        useCurrenciesCertStore.getState().setCertificateUrl(res.certificateUrl)
        useCurrenciesCertStore.getState().setPendingFile(null)
      }
    } catch {
      toast.error({ title: t(FAILED_UPLOAD_MSG) })
    }
  }, [instanceId, toast, t])

  const persistFlightPackages = useCallback(async () => {
    const { flightPackages } = useCurrenciesCertStore.getState()
    if (flightPackages.length === 0) return
    const saved = await saveFlightPackages(instanceId, flightPackages)
    // Response has {id, name} only — merge IDs into existing packages (preserves tasks)
    useCurrenciesCertStore.setState({
      flightPackages: flightPackages.map((pkg, idx) => ({
        ...pkg,
        id: saved[idx]?.id ?? pkg.id,
      })),
    })
  }, [instanceId])

  // Task associations must be persisted after packages (references task_master_id)
  const persistTaskAssociations = useCallback(async () => {
    const { taskAssociations } = useCurrenciesCertStore.getState()
    const valid = taskAssociations.filter((a) => a.task_master_id !== 0)
    const saved = await saveTaskAssociations(instanceId, valid)
    useCurrenciesCertStore.getState().setTaskAssociations(saved)
  }, [instanceId])

  const persistFlightPackAssociations = useCallback(async () => {
    const { fpaAssociations } = useCurrenciesCertStore.getState()
    const valid = fpaAssociations.filter((a) => a.package_id !== 0)
    const saved = await saveFlightPackAssociations(instanceId, valid)
    useCurrenciesCertStore.setState({ fpaAssociations: saved })
  }, [instanceId])

  const persistCurrencies = useCallback(async () => {
    const ids = useCurrenciesCertStore.getState().selectedCurrencyIds
    if (ids.length > 0) await saveSelectedCurrencies(instanceId, ids)
  }, [instanceId])

  const handleSave = useCallback(async () => {
    await persistPendingCertificate()
    await persistFlightPackages()
    await persistTaskAssociations()
    await persistFlightPackAssociations()
    await persistCurrencies()
  }, [persistPendingCertificate, persistFlightPackages, persistTaskAssociations, persistCurrencies, persistFlightPackAssociations])

  const handleSaveDraft = useCallback(async () => {
    if (!instanceId) return
    useCurrenciesCertStore.getState().setSavingTab('draft')
    try {
      await handleSave()
      toast.success({ title: t(DRAFT_SAVED_MSG) })
    } catch {
      toast.error({ title: t(FAILED_SAVE_MSG) })
    } finally {
      useCurrenciesCertStore.getState().setSavingTab(null)
    }
  }, [instanceId, handleSave, toast, t])

  const handleSaveAndClose = useCallback(async () => {
    try { await handleSave() } catch { toast.error({ title: t(FAILED_SAVE_MSG) }) }
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
      await persistCurrencies()
    }
  }, [persistFlightPackages, persistTaskAssociations, persistPendingCertificate, persistCurrencies, persistFlightPackAssociations])

  const handleToggleStatus = useCallback(async (tabNo: SubTab) => {
    if (!instanceId) return
    useCurrenciesCertStore.getState().setTogglingTab(tabNo)
    try {
      const st = useCurrenciesCertStore.getState()
      const isCurrentComplete = tabNo === 'flight'
        ? st.isFlightComplete
        : tabNo === 'currencies'
          ? st.isCurrencyComplete
          : tabNo === 'taskAssociation'
            ? st.isTaskAssocComplete
            : tabNo === 'flightPackAssociation'
              ? st.fpaComplete
              : st.isCertComplete

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
          await persistCurrencies()
        } else {
          await persistPendingCertificate()
        }
      }

      if (tabNo === 'flight') {
        const resp = isCurrentComplete
          ? await unmarkFlightPackageComplete(instanceId)
          : await markFlightPackageComplete(instanceId)
        setFlightCompletion(resp.flight_package_completion)
      } else if (tabNo === 'taskAssociation') {
        const resp = isCurrentComplete
          ? await unmarkTaskAssociationComplete(instanceId)
          : await markTaskAssociationComplete(instanceId)
        setTaskAssociationCompletion(resp.task_association_completion)
      } else if (tabNo === 'flightPackAssociation') {
        const resp = isCurrentComplete
          ? await unmarkFlightPackAssociationComplete(instanceId)
          : await markFlightPackAssociationComplete(instanceId)
        setFpaCompletion(resp.flight_pack_association_completion)
      } else {
        const resp = isCurrentComplete
          ? await unmarkCurrenciesCertComplete(instanceId, tabNo)
          : await markCurrenciesCertComplete(instanceId, tabNo)
        setCompletionStatus(resp.currencies_certificate_completion)
      }

      toast.success({ title: isCurrentComplete ? t(INCOMPLETE_MSG) : t(COMPLETE_MSG) })
    } catch {
      toast.error({ title: t(FAILED_SAVE_MSG) })
    } finally {
      useCurrenciesCertStore.getState().setTogglingTab(null)
    }
  }, [instanceId, persistFlightPackages, persistTaskAssociations, persistCurrencies, persistFlightPackAssociations, persistPendingCertificate, setFlightCompletion, setTaskAssociationCompletion, setFpaCompletion, setCompletionStatus, toast, t])

  // ── Render ──
  const activeTabComplete = activeTab === 'flight'
    ? isFlightComplete
    : activeTab === 'currencies'
      ? isCurrencyComplete
      : activeTab === 'taskAssociation'
        ? isTaskAssocComplete
        : activeTab === 'flightPackAssociation'
          ? isFpaComplete
          : isCertComplete

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
  const listPath = '/course-management/course-selection'
  const scopeLabel = 'Course Selection'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <Breadcrumb
        items={courseCategoryCrumbs({
          scopeLabel,
          listPath,
          courseTitle,
          detailPath,
          categoryLabel: t('courseManagement.currenciesCert.title'),
        })}
        className="mb-2"
      />
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(detailPath)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0"
          >
            <HiOutlineArrowLeft className="text-[14px]" />
            {t('courseManagement.currenciesCert.common.back')}
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em]">
            <HiOutlineDocumentText className="text-[11px]" />
            {t('courseManagement.currenciesCert.title')}
          </div>
          {courseTitle && <span className="text-[15px] font-bold text-primary">{courseTitle}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-muted tracking-[0.06em] uppercase">
            {t('courseManagement.currenciesCert.common.status')}
          </span>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{
              background: isComplete ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.12)',
              color: isComplete ? '#16A34A' : '#D97706',
            }}
          >
            {isComplete ? t(COMPLETE_MSG) : t(INCOMPLETE_MSG)}
          </span>
          <span className="text-[11px] font-bold text-muted ml-2">{overallProgress}%</span>
        </div>
      </div>
      {/* Progress bar */}
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
      {/* Status banner */}
      {hasWrite && (
        <div
          className="flex items-center justify-between gap-3 px-6 py-3 border-b border-[var(--border)]"
          style={{ background: activeTabComplete ? 'rgba(34,197,94,0.06)' : 'var(--surface-2)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: activeTabComplete ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                color: activeTabComplete ? '#16A34A' : '#D97706',
              }}
            >
              {activeTabComplete ? t(COMPLETE_MSG) : t(INCOMPLETE_MSG)}
            </span>
            <span className="text-[12.5px] text-muted">
              {getTabStatusMessage(activeTab, activeTabComplete, masterApproved)}
            </span>
          </div>
          {!(masterApproved && activeTabComplete) && (
            <button
              type="button"
              onClick={() => handleToggleStatus(activeTab)}
              disabled={storeTogglingTab !== null}
              className="px-3 py-1.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-semibold cursor-pointer hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
            >
              {activeTabComplete ? 'Unmark Complete' : 'Mark Complete'}
            </button>
          )}
        </div>
      )}
      {/* Tab content */}
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
      {/* Footer */}
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

function getTabStatusMessage(activeTab: SubTab, currentTabComplete: boolean, masterApproved: boolean): string {
  if (masterApproved && currentTabComplete) return MASTER_APPROVED_LOCK
  if (activeTab === 'flight') return currentTabComplete ? FLIGHT_MARKED_COMPLETE : FLIGHT_ADD
  if (activeTab === 'currencies') return currentTabComplete ? CURRENCY_MARKED_COMPLETE : CURRENCY_SELECT
  if (activeTab === 'taskAssociation') return currentTabComplete ? TASK_ASSOC_MARKED_COMPLETE : TASK_ASSOC_ADD
  if (activeTab === 'flightPackAssociation') return currentTabComplete ? FPA_MARKED_COMPLETE : FPA_ADD
  return currentTabComplete ? CERT_MARKED_COMPLETE : CERT_UPLOAD
}
