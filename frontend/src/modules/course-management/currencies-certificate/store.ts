import { create } from 'zustand'
import type {
  CurrencyItem,
  FlightPackage,
  FlightPackageTask,
  FlightTaskMasterOption,
  TaskAssociation,
  EnablingObjectiveOption,
  FlightPackAssociation,
  LessonOption,
} from './currencies-cert-api'
import {
  getAvailableCurrencies,
  getMasterCourseCurrencies,
  getCertificateUrl,
  getCourseInfo,
  getFlightPackages,
  getFlightTaskMaster,
  getTaskAssociations,
  getEnablingObjectiveOptions,
  getFlightPackAssociations,
  getFlightPackLessons,
  getAvailablePackagesForFpa,
} from './currencies-cert-api'
import {
  isCurrenciesComplete,
  isCertificateComplete,
  isFlightComplete,
  isTaskAssociationComplete,
  isFlightPackAssociationComplete,
  computeTabsProgress,
} from './currency-cert-config'

type SubTab = 'flight' | 'currencies' | 'taskAssociation' | 'certificate' | 'flightPackAssociation'

interface CurrenciesCertState {
  // Data
  availableCurrencies: CurrencyItem[]
  selectedCurrencyIds: number[]
  prevSelectedIds: number[]
  certificateUrl: string | null
  flightPackages: FlightPackage[]
  taskMaster: FlightTaskMasterOption[]
  taskAssociations: TaskAssociation[]
  eoOptions: EnablingObjectiveOption[]
  fpaAssociations: FlightPackAssociation[]
  fpaLessons: LessonOption[]
  fpaPackageOptions: { id: number; label: string }[]
  fpaCompletion: number
  courseTitle: string
  completionStatus: number
  flightCompletion: number
  taskAssociationCompletion: number
  masterApproved: boolean
  loading: boolean
  error: string | null

  // Derived
  isFlightComplete: boolean
  isCurrencyComplete: boolean
  isTaskAssocComplete: boolean
  isCertComplete: boolean
  fpaComplete?: boolean
  isComplete: boolean
  overallProgress: number
  tabsCompleted: string

  // UI
  activeTab: SubTab
  savingTab: string | null
  togglingTab: SubTab | null
  pendingFile: File | null
  fpaLoaded: boolean

  // Actions
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setActiveTab: (tab: SubTab) => void
  setPendingFile: (file: File | null) => void
  setSavingTab: (tab: string | null) => void
  setTogglingTab: (tab: SubTab | null) => void
  setCertificateUrl: (url: string | null) => void
  setFpaLoaded: (loaded: boolean) => void

  // Currency selection (for children)
  selectCurrency: (id: number) => void
  removeCurrency: (id: number) => void
  setSelectedCurrencyIds: (ids: number[]) => void

  // Flight package mutations (for FlightPackageTab)
  setFlightPackages: (packages: FlightPackage[]) => void
  addFlightPackage: () => void
  updateFlightPackageName: (index: number, name: string) => void
  removeFlightPackage: (index: number) => void
  addFlightTask: (packageIndex: number, taskMasterId: number) => void
  removeFlightTask: (packageIndex: number, taskIndex: number) => void

  // Shared task catalog
  addTaskMasterOption: (option: FlightTaskMasterOption) => void

  // Task association mutations (for TaskAssociationTab)
  setTaskAssociations: (associations: TaskAssociation[]) => void
  addTaskAssociation: () => void
  removeTaskAssociation: (index: number) => void
  setTaskAssociationTask: (index: number, taskMasterId: number) => void
  toggleTaskAssociationEO: (index: number, eoId: number) => void
  toggleTaskAssociationCurrency: (index: number, currencyId: number) => void

  // Flight Pack Association mutations (for FlightPackAssociationTab)
  setFpaAssociations: (associations: FlightPackAssociation[]) => void
  addFpaAssociation: () => void
  removeFpaAssociation: (index: number) => void
  setFpaPackage: (index: number, packageId: number) => void
  setFpaPackageOptions: (options: { id: number; label: string }[]) => void
  toggleFpaLesson: (index: number, lessonId: number) => void

  // Completion (for TabBar)
  setCompletionStatus: (status: number) => void
  setFlightCompletion: (status: number) => void
  setTaskAssociationCompletion: (status: number) => void
  setFpaCompletion: (status: number) => void

  // Async operations (for page + children)
  init: (masterId: number) => Promise<void>
}

function deriveProgress(
  flightDone: boolean,
  currencyDone: boolean,
  taskAssocDone: boolean,
  certDone: boolean,
  fpaDone: boolean | undefined,
) {
  const { overallProgress, tabsCompleted } = computeTabsProgress(
    flightDone, currencyDone, taskAssocDone, certDone, fpaDone,
  )
  return {
    isComplete: flightDone && currencyDone && taskAssocDone && certDone && (fpaDone ?? false),
    overallProgress,
    tabsCompleted,
  }
}

const useCurrenciesCertStore = create<CurrenciesCertState>((set, get) => ({
  availableCurrencies: [],
  selectedCurrencyIds: [],
  prevSelectedIds: [],
  certificateUrl: null,
  flightPackages: [],
  taskMaster: [],
  taskAssociations: [],
  eoOptions: [],
  fpaAssociations: [],
  fpaLessons: [],
  fpaPackageOptions: [],
  fpaCompletion: 0,
  courseTitle: '',
  completionStatus: 0,
  flightCompletion: 0,
  taskAssociationCompletion: 0,
  masterApproved: false,
  loading: true,
  error: null,

  activeTab: 'flight',
  savingTab: null,
  togglingTab: null,
  pendingFile: null,
  fpaLoaded: false,

  isFlightComplete: false,
  isCurrencyComplete: false,
  isTaskAssocComplete: false,
  isCertComplete: false,
  fpaComplete: false,
  isComplete: false,
  overallProgress: 0,
  tabsCompleted: '0/5',

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setPendingFile: (pendingFile) => set({ pendingFile }),
  setSavingTab: (savingTab) => set({ savingTab }),
  setTogglingTab: (togglingTab) => set({ togglingTab }),
  setCertificateUrl: (certificateUrl) => set({ certificateUrl }),
  setFpaLoaded: (fpaLoaded) => set({ fpaLoaded }),
  selectCurrency: (id: number) => {
    const { selectedCurrencyIds } = get()
    const newSelected = selectedCurrencyIds.includes(id)
      ? selectedCurrencyIds.filter((i) => i !== id)
      : [...selectedCurrencyIds, id]
    set({ selectedCurrencyIds: newSelected, prevSelectedIds: [...newSelected] })
  },
  removeCurrency: (id: number) => {
    const { selectedCurrencyIds } = get()
    const newSelected = selectedCurrencyIds.filter((i) => i !== id)
    set({ selectedCurrencyIds: newSelected, prevSelectedIds: newSelected })
  },
  setSelectedCurrencyIds: (selectedCurrencyIds) => set({ selectedCurrencyIds, prevSelectedIds: [...selectedCurrencyIds] }),

  setFlightPackages: (flightPackages) => set({ flightPackages }),
  addFlightPackage: () => set({ flightPackages: [...get().flightPackages, { name: '', tasks: [] }] }),
  updateFlightPackageName: (index, name) => set({
    flightPackages: get().flightPackages.map((p, i) => (i === index ? { ...p, name } : p)),
  }),
  removeFlightPackage: (index) => set({
    flightPackages: get().flightPackages.filter((_, i) => i !== index),
  }),
  addFlightTask: (packageIndex, taskMasterId) => {
    const option = get().taskMaster.find((o) => o.id === taskMasterId)
    if (!option) return
    set({
      flightPackages: get().flightPackages.map((p, i) =>
        i === packageIndex
          ? {
              ...p,
              tasks: [
                ...p.tasks,
                { task_master_id: option.id, task_no: option.task_no, task_description: option.task_description },
              ],
            }
          : p,
      ),
    })
  },
  removeFlightTask: (packageIndex, taskIndex) => set({
    flightPackages: get().flightPackages.map((p, i) =>
      i === packageIndex ? { ...p, tasks: p.tasks.filter((_, j) => j !== taskIndex) } : p,
    ),
  }),

  addTaskMasterOption: (option) => {
    const exists = get().taskMaster.some((o) => o.id === option.id)
    set({ taskMaster: exists ? get().taskMaster : [...get().taskMaster, option] })
  },

  setTaskAssociations: (taskAssociations) => set({ taskAssociations }),
  addTaskAssociation: () => set({
    taskAssociations: [
      ...get().taskAssociations,
      { task_master_id: 0, task_no: '', task_description: '', enabling_objectives: [], currencies: [] },
    ],
  }),
  removeTaskAssociation: (index) => set({
    taskAssociations: get().taskAssociations.filter((_, i) => i !== index),
  }),
  setTaskAssociationTask: (index, taskMasterId) => {
    const allTasks = get().flightPackages.flatMap((p) => p.tasks)
    const match = allTasks.find((tk) => tk.task_master_id === taskMasterId)
    set({
      taskAssociations: get().taskAssociations.map((a, i) =>
        i === index
          ? {
              ...a,
              task_master_id: taskMasterId,
              task_no: match?.task_no ?? '',
              task_description: match?.task_description ?? '',
            }
          : a,
      ),
    })
  },
  toggleTaskAssociationEO: (index, eoId) => {
    const option = get().eoOptions.find((o) => o.id === eoId)
    set({
      taskAssociations: get().taskAssociations.map((a, i) => {
        if (i !== index) return a
        const has = a.enabling_objectives.some((e) => e.enabling_objective_id === eoId)
        return {
          ...a,
          enabling_objectives: has
            ? a.enabling_objectives.filter((e) => e.enabling_objective_id !== eoId)
            : [...a.enabling_objectives, { enabling_objective_id: eoId, label: option?.label ?? '' }],
        }
      }),
    })
  },
  toggleTaskAssociationCurrency: (index, currencyId) => {
    const option = get().availableCurrencies.find((c) => c.id === currencyId)
    set({
      taskAssociations: get().taskAssociations.map((a, i) => {
        if (i !== index) return a
        const has = a.currencies.some((c) => c.currency_master_id === currencyId)
        return {
          ...a,
          currencies: has
            ? a.currencies.filter((c) => c.currency_master_id !== currencyId)
            : [...a.currencies, { currency_master_id: currencyId, name: option?.name ?? '' }],
        }
      }),
    })
  },

  setFpaAssociations: (fpaAssociations) => set({ fpaAssociations }),
  addFpaAssociation: () => set({
    fpaAssociations: [
      ...get().fpaAssociations,
      { package_id: 0, package_name: '', lessons: [] },
    ],
  }),
  removeFpaAssociation: (index) => set({
    fpaAssociations: get().fpaAssociations.filter((_, i) => i !== index),
  }),
  setFpaPackage: (index, packageId) => {
    const found = get().fpaPackageOptions.find((p) => p.id === packageId)
    set({
      fpaAssociations: get().fpaAssociations.map((a, i) =>
        i === index
          ? {
              ...a,
              package_id: packageId,
              package_name: found?.label ?? '',
            }
          : a,
      ),
    })
  },
  setFpaPackageOptions: (options) => set({ fpaPackageOptions: options }),
  toggleFpaLesson: (index, lessonId) => {
    const option = get().fpaLessons.find((o) => o.id === lessonId)
    set({
      fpaAssociations: get().fpaAssociations.map((a, i) => {
        if (i !== index) return a
        const has = a.lessons.some((l) => l.lesson_id === lessonId)
        return {
          ...a,
          lessons: has
            ? a.lessons.filter((l) => l.lesson_id !== lessonId)
            : [...a.lessons, { lesson_id: lessonId, lesson_title: option?.lesson_title ?? '' }],
        }
      }),
    })
  },

  setCompletionStatus: (completionStatus) => {
    const isCurrencyComplete = isCurrenciesComplete(completionStatus)
    const isCertComplete = isCertificateComplete(completionStatus)
    const { isFlightComplete: flightDone, isTaskAssocComplete, fpaComplete: fpaDone } = get()
    set({
      completionStatus,
      isCurrencyComplete,
      isCertComplete,
      ...deriveProgress(flightDone, isCurrencyComplete, isTaskAssocComplete, isCertComplete, fpaDone),
    })
  },
  setFlightCompletion: (flightCompletion) => {
    const flightDone = isFlightComplete(flightCompletion)
    const { isCurrencyComplete, isTaskAssocComplete, isCertComplete, fpaComplete: fpaDone } = get()
    set({
      flightCompletion,
      isFlightComplete: flightDone,
      ...deriveProgress(flightDone, isCurrencyComplete, isTaskAssocComplete, isCertComplete, fpaDone),
    })
  },
  setTaskAssociationCompletion: (taskAssociationCompletion) => {
    const taskAssocDone = isTaskAssociationComplete(taskAssociationCompletion)
    const { isFlightComplete: flightDone, isCurrencyComplete, isCertComplete, fpaComplete: fpaDone } = get()
    set({
      taskAssociationCompletion,
      isTaskAssocComplete: taskAssocDone,
      ...deriveProgress(flightDone, isCurrencyComplete, taskAssocDone, isCertComplete, fpaDone),
    })
  },
  setFlightPackAssociationCompletion: (flightPackAssociationCompletion: number) => {
    const fpaDone = isFlightPackAssociationComplete(flightPackAssociationCompletion)
    const { isFlightComplete: flightDone, isCurrencyComplete, isTaskAssocComplete, isCertComplete } = get()
    set({
      fpaComplete: fpaDone,
      fpaCompletion: flightPackAssociationCompletion,
      ...deriveProgress(flightDone, isCurrencyComplete, isTaskAssocComplete, isCertComplete, fpaDone),
    })
  },
  setFpaCompletion: (status: number) => {
    const fpaDone = isFlightPackAssociationComplete(status)
    const { isFlightComplete: flightDone, isCurrencyComplete, isTaskAssocComplete, isCertComplete } = get()
    set({
      fpaCompletion: status,
      fpaComplete: fpaDone,
      ...deriveProgress(flightDone, isCurrencyComplete, isTaskAssocComplete, isCertComplete, fpaDone),
    })
  },
  init: async (masterId: number) => {
    set({ loading: true, error: null, activeTab: 'flight' })
    try {
      const [availRes, selRes, courseRes, flightRes, taskMasterRes, taskAssocRes, eoRes, fpaRes, lessonRes, fpaPkgsRes] = await Promise.all([
        getAvailableCurrencies(masterId),
        getMasterCourseCurrencies(masterId),
        getCourseInfo(masterId),
        getFlightPackages(masterId),
        getFlightTaskMaster(),
        getTaskAssociations(masterId),
        getEnablingObjectiveOptions(masterId),
        getFlightPackAssociations(masterId),
        getFlightPackLessons(masterId),
        getAvailablePackagesForFpa(masterId),
      ])
      const completionStatus = courseRes.currencies_certificate_completion ?? 0
      const flightCompletion = courseRes.flight_package_completion ?? 0
      const taskAssociationCompletion = courseRes.task_association_completion ?? 0
      const flightDone = isFlightComplete(flightCompletion)
      const isCurrencyComplete = isCurrenciesComplete(completionStatus)
      const taskAssocDone = isTaskAssociationComplete(taskAssociationCompletion)
      const isCertComplete = isCertificateComplete(completionStatus)
      const fpaDone = isFlightPackAssociationComplete(courseRes.flight_pack_association_completion ?? 0)
      const { overallProgress: prog, tabsCompleted: tabs } = computeTabsProgress(
        flightDone, isCurrencyComplete, taskAssocDone, isCertComplete, fpaDone,
      )
      set({
        availableCurrencies: availRes,
        selectedCurrencyIds: selRes.map(r => r.currency_master_id),
        prevSelectedIds: selRes.map(r => r.currency_master_id),
        flightPackages: flightRes.map((p: { id?: number; name: string; tasks?: FlightPackageTask[] }) => ({
          ...p,
          tasks: p.tasks ?? [],
        })),
        taskMaster: taskMasterRes,
        taskAssociations: taskAssocRes,
        eoOptions: eoRes,
        fpaAssociations: fpaRes,
        fpaLessons: lessonRes,
        fpaPackageOptions: fpaPkgsRes.map(p => ({ id: p.package_id, label: p.package_name })),
        fpaCompletion: courseRes.flight_pack_association_completion ?? 0,
        completionStatus,
        flightCompletion,
        taskAssociationCompletion,
        courseTitle: courseRes.course_title,
        masterApproved: courseRes.course_master_status === 'approved',
        isFlightComplete: flightDone,
        isCurrencyComplete,
        isTaskAssocComplete: taskAssocDone,
        isCertComplete,
        fpaComplete: fpaDone,
        ...{ overallProgress: prog, tabsCompleted: tabs },
      })
      const certRes = await getCertificateUrl(masterId)
      if (certRes.certificateUrl) {
        set({ certificateUrl: certRes.certificateUrl })
      }
    } catch (e: any) {
      set({ error: e?.message || 'Failed to load data' })
    } finally {
      set({ loading: false })
    }
  },
}))

// Selectors for fine-grained subscriptions
export const selectActiveTab = (s: CurrenciesCertState) => s.activeTab
export const selectIsFlightComplete = (s: CurrenciesCertState) => s.isFlightComplete
export const selectIsCurrencyComplete = (s: CurrenciesCertState) => s.isCurrencyComplete
export const selectIsTaskAssocComplete = (s: CurrenciesCertState) => s.isTaskAssocComplete
export const selectIsFlightPackAssocComplete = (s: CurrenciesCertState) => s.fpaComplete ?? false
export const selectIsCertificateComplete = (s: CurrenciesCertState) => s.isCertComplete
export const selectTaskAssociations = (s: CurrenciesCertState) => s.taskAssociations
export const selectEoOptions = (s: CurrenciesCertState) => s.eoOptions
export const selectIsComplete = (s: CurrenciesCertState) => s.isComplete
export const selectOverallProgress = (s: CurrenciesCertState) => s.overallProgress
export const selectTabsCompleted = (s: CurrenciesCertState) => s.tabsCompleted
export const selectAvailableCurrencies = (s: CurrenciesCertState) => s.availableCurrencies
export const selectSelectedCurrencyIds = (s: CurrenciesCertState) => s.selectedCurrencyIds
export const selectCertificateUrl = (s: CurrenciesCertState) => s.certificateUrl
export const selectFlightPackages = (s: CurrenciesCertState) => s.flightPackages
export const selectTaskMaster = (s: CurrenciesCertState) => s.taskMaster
export const selectPendingFile = (s: CurrenciesCertState) => s.pendingFile
export const selectCourseTitle = (s: CurrenciesCertState) => s.courseTitle
export const selectMasterApproved = (s: CurrenciesCertState) => s.masterApproved
export const selectCompletionStatus = (s: CurrenciesCertState) => s.completionStatus
export const selectLoading = (s: CurrenciesCertState) => s.loading
export const selectError = (s: CurrenciesCertState) => s.error
export const selectSavingTab = (s: CurrenciesCertState) => s.savingTab
export const selectTogglingTab = (s: CurrenciesCertState) => s.togglingTab
export const selectFpaAssociations = (s: CurrenciesCertState) => s.fpaAssociations
export const selectFpaLessons = (s: CurrenciesCertState) => s.fpaLessons
export const selectFpaCompletion = (s: CurrenciesCertState) => s.fpaCompletion

export const selectSetActiveTab = (s: CurrenciesCertState) => s.setActiveTab
export const selectSelectCurrency = (s: CurrenciesCertState) => s.selectCurrency
export const selectRemoveCurrency = (s: CurrenciesCertState) => s.removeCurrency
export const selectSetCompletionStatus = (s: CurrenciesCertState) => s.setCompletionStatus

export default useCurrenciesCertStore
