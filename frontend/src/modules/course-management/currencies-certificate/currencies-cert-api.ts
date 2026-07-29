export interface AvailableCurrency {
  id: number
  name: string
}

export interface MasterCourseCurrencyRecord {
  id: number
  course_master_id: number
  currency_master_id: number
}

export interface CurrencyItem {
  id: number
  name: string
}

export interface CurrencyCertTabCompletion {
  tab: string
  tab_status: string
  currencies_certificate_completion: number
}

interface ApiEnvelope<T> {
  success?: boolean
  data?: T
  error?: { message?: string; code?: string }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token')
  const res = await fetch(`/api/v1${url}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  })
  if (!res.ok) {
    const err: ApiEnvelope<T> = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || res.statusText)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  const json: ApiEnvelope<T> = await res.json()
  return (json.data ?? (json as unknown as T)) as T
}

export const getAvailableCurrencies = (masterId: number): Promise<AvailableCurrency[]> =>
  apiFetch(`/course-masters/${masterId}/currencies/available`)

export const getMasterCourseCurrencies = (masterId: number): Promise<MasterCourseCurrencyRecord[]> =>
  apiFetch(`/course-masters/${masterId}/currencies/selected`)

export const saveMasterCourseCurrencies = (
  masterId: number,
  currencyIds: number[],
): Promise<MasterCourseCurrencyRecord[]> =>
  apiFetch(`/course-masters/${masterId}/currencies/selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currency_ids: currencyIds }),
  })

export const getCourseInfo = (masterId: number): Promise<{
  course_title: string
  course_master_status: string
  currencies_certificate_completion: number
  flight_package_completion: number
  task_association_completion: number
  flight_pack_association_completion: number
}> =>
  apiFetch(`/course-infos/${masterId}`)

export const getCertificateUrl = (masterId: number): Promise<{ certificateUrl: string | null }> =>
  apiFetch(`/course-masters/${masterId}/currencies/certification`)

export const uploadCertificate = (
  masterId: number,
  file: File,
): Promise<{ id: string; filename: string; certificateUrl: string }> => {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch(`/course-masters/${masterId}/currencies/certification/upload`, {
    method: 'POST',
    body: formData,
  })
}

export const markCurrenciesCertComplete = (
  masterId: number,
  tabNo: 'currencies' | 'certificate',
): Promise<CurrencyCertTabCompletion> =>
  apiFetch(`/course-masters/${masterId}/currencies/${tabNo}/complete`, { method: 'POST' })

export const unmarkCurrenciesCertComplete = (
  masterId: number,
  tabNo: 'currencies' | 'certificate',
): Promise<CurrencyCertTabCompletion> =>
  apiFetch(`/course-masters/${masterId}/currencies/${tabNo}/incomplete`, { method: 'POST' })

// ── Flight Package ──────────────────────────────────────────────────────────

// A task within a package references the shared catalog by task_master_id;
// task_no / task_description are denormalized for display only.
export interface FlightPackageTask {
  id?: number
  task_master_id: number
  task_no: string
  task_description: string
}

export interface FlightPackage {
  id?: number
  name: string
  tasks: FlightPackageTask[]
}

export interface FlightTaskMasterOption {
  id: number
  task_no: string
  task_description: string
}

export interface FlightPackageCompletion {
  tab: string
  tab_status: string
  flight_package_completion: number
}

export const getFlightPackages = (masterId: number): Promise<FlightPackage[]> =>
  apiFetch(`/course-masters/${masterId}/flight-packages`)

export const saveFlightPackages = (
  masterId: number,
  packages: FlightPackage[],
): Promise<FlightPackage[]> =>
  apiFetch(`/course-masters/${masterId}/flight-packages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packages: packages.map((p) => ({
        name: p.name,
        tasks: p.tasks.map((t) => ({ task_master_id: t.task_master_id })),
      })),
    }),
  })

// ── Flight Task Master (shared catalog) ─────────────────────────────────────

export const getFlightTaskMaster = (): Promise<FlightTaskMasterOption[]> =>
  apiFetch(`/flight-task-master`)

export const createFlightTaskMaster = (
  taskNo: string,
  taskDescription: string,
): Promise<FlightTaskMasterOption> =>
  apiFetch(`/flight-task-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_no: taskNo, task_description: taskDescription }),
  })

export const markFlightPackageComplete = (masterId: number): Promise<FlightPackageCompletion> =>
  apiFetch(`/course-masters/${masterId}/flight-packages/complete`, { method: 'POST' })

export const unmarkFlightPackageComplete = (masterId: number): Promise<FlightPackageCompletion> =>
  apiFetch(`/course-masters/${masterId}/flight-packages/incomplete`, { method: 'POST' })

// ── Task Association ────────────────────────────────────────────────────────

// One association record: a task plus the EOs and currencies it maps to.
// task_no / task_description / labels / names are denormalized for display.
export interface TaskAssociationEO {
  enabling_objective_id: number
  label: string
}

export interface TaskAssociationCurrency {
  currency_master_id: number
  name: string
}

export interface TaskAssociation {
  id?: number
  task_master_id: number
  task_no: string
  task_description: string
  enabling_objectives: TaskAssociationEO[]
  currencies: TaskAssociationCurrency[]
}

export interface AvailableTask {
  task_master_id: number
  task_no: string
  task_description: string
}

export interface EnablingObjectiveOption {
  id: number
  label: string
}

export interface TaskAssociationCompletion {
  tab: string
  tab_status: string
  task_association_completion: number
}

export const getTaskAssociations = (masterId: number): Promise<TaskAssociation[]> =>
  apiFetch(`/course-masters/${masterId}/task-associations`)

export const saveTaskAssociations = (
  masterId: number,
  associations: TaskAssociation[],
): Promise<TaskAssociation[]> =>
  apiFetch(`/course-masters/${masterId}/task-associations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      associations: associations.map((a) => ({
        task_master_id: a.task_master_id,
        enabling_objective_ids: a.enabling_objectives.map((e) => e.enabling_objective_id),
        currency_master_ids: a.currencies.map((c) => c.currency_master_id),
      })),
    }),
  })

export const getAvailableTasks = (masterId: number): Promise<AvailableTask[]> =>
  apiFetch(`/course-masters/${masterId}/task-associations/available-tasks`)

export const getEnablingObjectiveOptions = (masterId: number): Promise<EnablingObjectiveOption[]> =>
  apiFetch(`/course-masters/${masterId}/task-associations/enabling-objectives`)

export const markTaskAssociationComplete = (masterId: number): Promise<TaskAssociationCompletion> =>
  apiFetch(`/course-masters/${masterId}/task-associations/complete`, { method: 'POST' })

export const unmarkTaskAssociationComplete = (masterId: number): Promise<TaskAssociationCompletion> =>
  apiFetch(`/course-masters/${masterId}/task-associations/incomplete`, { method: 'POST' })

// ── Flight Pack Association ─────────────────────────────────────────────────

export interface FlightPackAssociationLesson {
  lesson_id: number
  lesson_title: string
}

export interface FlightPackAssociation {
  id?: number
  package_id: number
  package_name: string
  lessons: FlightPackAssociationLesson[]
}

export interface LessonOption {
  id: number
  lesson_title: string
}

export interface FlightPackAssociationCompletion {
  tab: string
  tab_status: string
  flight_pack_association_completion: number
}

export const getFlightPackAssociations = (masterId: number): Promise<FlightPackAssociation[]> =>
  apiFetch(`/course-masters/${masterId}/flight-pack-associations`)

export const saveFlightPackAssociations = (
  masterId: number,
  associations: FlightPackAssociation[],
): Promise<FlightPackAssociation[]> =>
  apiFetch(`/course-masters/${masterId}/flight-pack-associations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      associations: associations.map((a) => ({
        package_id: a.package_id,
        lesson_ids: a.lessons.map((l) => l.lesson_id),
      })),
    }),
  })

export const getFlightPackLessons = (masterId: number): Promise<LessonOption[]> =>
  apiFetch(`/course-masters/${masterId}/flight-pack-associations/lessons`)

export const getAvailablePackagesForFpa = (masterId: number): Promise<{ package_id: number; package_name: string }[]> =>
  apiFetch(`/course-masters/${masterId}/flight-pack-associations/available-packages`)

export const markFlightPackAssociationComplete = (masterId: number): Promise<FlightPackAssociationCompletion> =>
  apiFetch(`/course-masters/${masterId}/flight-pack-associations/complete`, { method: 'POST' })

export const unmarkFlightPackAssociationComplete = (masterId: number): Promise<FlightPackAssociationCompletion> =>
  apiFetch(`/course-masters/${masterId}/flight-pack-associations/incomplete`, { method: 'POST' })
