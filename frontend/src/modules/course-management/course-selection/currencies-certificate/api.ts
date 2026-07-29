// Course Selection (instance) Currencies & Certificate API. Mirrors the master
// `currencies-certificate/currencies-cert-api.ts` function-by-function but
// targets the instance base path `/api/v1/course-selection-currencies`.
import { client } from '../../../../api/client'
import type { AvailableCurrency, CurrencyCertTabCompletion } from '../../currencies-certificate/currencies-cert-api'

const BASE = '/api/v1/course-selection-currencies'

// ─── Type aliases shared with the master ─────────────────────────────────────

export interface AvailableCurrencyItem {
  id: number
  name: string
}

export interface InstanceCurrencyRecord {
  id: number
  course_instance_id: number
  currency_master_id: number
}

// ─── Common API response unwrapper ───────────────────────────────────────────
// Mirrors the `apiFetch` in the master module: handles the `{ success: true, data: T }`
// envelope and returns the inner value directly.
function unwrap<T>(res: { data: unknown }): T {
  const d = res.data
  if (d && (d as any).success) return (d as any).data as T
  return d as T
}

// ─── Available currencies ─────────────────────────────────────────────────────

export const getAvailableCurrencies = (instanceId: number): Promise<AvailableCurrencyItem[]> =>
  client.get({ url: `${BASE}/${instanceId}/currencies/available` }).then(r => unwrap(r.data as any) ?? [])

// ─── Selected currencies ──────────────────────────────────────────────────────

export const getSelectedCurrencies = (instanceId: number): Promise<InstanceCurrencyRecord[]> =>
  client.get({ url: `${BASE}/${instanceId}/currencies/selected` }).then(r => unwrap(r.data as any) ?? [])

export const saveSelectedCurrencies = (
  instanceId: number,
  currencyIds: number[],
): Promise<InstanceCurrencyRecord[]> =>
  client.post({
    url: `${BASE}/${instanceId}/currencies/selected`,
    body: { currency_ids: currencyIds },
    headers: { 'Content-Type': 'application/json' },
  }).then(r => unwrap(r.data as any) ?? [])

// ─── Get course info / completion status ──────────────────────────────────────
// The instance doesn't have its own /course-infos/{id} endpoint; the
// currencies_certificate_completion value is on the CourseInstance itself.

export const getInstanceInfo = (instanceId: number): Promise<{
  course_title: string
  course_master_status: string
  currencies_cert_seeded: boolean
  currencies_certificate_completion: number
  flight_package_completion: number
  task_association_completion: number
  flight_pack_association_completion: number
}> =>
  client.get({ url: `${BASE}/${instanceId}/info` }).then(r => {
    const d = unwrap(r.data as any) as any
    return {
      course_title: d.course_title,
      course_master_status: d.course_master_status || 'draft',
      currencies_cert_seeded: d.currencies_cert_seeded ?? false,
      currencies_certificate_completion: d.currencies_certificate_completion ?? 0,
      flight_package_completion: d.flight_package_completion ?? 0,
      task_association_completion: d.task_association_completion ?? 0,
      flight_pack_association_completion: d.flight_pack_association_completion ?? 0,
    }
  })

// ─── Certificate ──────────────────────────────────────────────────────────────

export const getCertificateUrl = (instanceId: number): Promise<{ certificateUrl: string | null }> =>
  client.get({ url: `${BASE}/${instanceId}/currencies/certification` }).then(r => unwrap(r.data as any) ?? { certificateUrl: null })

export const uploadCertificate = (
  instanceId: number,
  file: File,
): Promise<{ certificateUrl: string }> => {
  const formData = new FormData()
  formData.append('file', file)
    return fetch(`${BASE}/${instanceId}/currencies/certification/upload`, {
    method: 'POST',
    headers: localStorage.getItem('access_token') ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` } : {},
    body: formData,
  }).then(r => r.json())
}

// ─── Tab completion ───────────────────────────────────────────────────────────

export const markCurrenciesCertComplete = (
  instanceId: number,
  tabNo: 'currencies' | 'certificate',
): Promise<CurrencyCertTabCompletion> =>
  client.post({ url: `${BASE}/${instanceId}/currencies/${tabNo}/complete` }).then(r => unwrap(r.data as any))

export const unmarkCurrenciesCertComplete = (
  instanceId: number,
  tabNo: 'currencies' | 'certificate',
): Promise<CurrencyCertTabCompletion> =>
  client.post({ url: `${BASE}/${instanceId}/currencies/${tabNo}/incomplete` }).then(r => unwrap(r.data as any))

// ─── Flight Package (instance) ────────────────────────────────────────────────
// Mirrors the master `currencies-cert-api.ts` flight-package functions but
// targets the instance base path. Reuses the shared types from the master api.

import type {
  FlightPackage,
  FlightPackageCompletion,
  TaskAssociation,
  TaskAssociationCompletion,
  EnablingObjectiveOption,
  FlightPackAssociation,
  FlightPackAssociationCompletion,
  LessonOption,
} from '../../currencies-certificate/currencies-cert-api'

export const getFlightPackages = (instanceId: number): Promise<FlightPackage[]> =>
  client.get({ url: `${BASE}/${instanceId}/flight-packages` }).then(r => unwrap(r.data as any) ?? [])

export const saveFlightPackages = (
  instanceId: number,
  packages: FlightPackage[],
): Promise<FlightPackage[]> =>
  client.post({
    url: `${BASE}/${instanceId}/flight-packages`,
    body: {
      packages: packages.map((p) => ({
        name: p.name,
        tasks: p.tasks.map((t) => ({ task_master_id: t.task_master_id })),
      })),
    },
    headers: { 'Content-Type': 'application/json' },
  }).then(r => unwrap(r.data as any) ?? [])

export const markFlightPackageComplete = (instanceId: number): Promise<FlightPackageCompletion> =>
  client.post({ url: `${BASE}/${instanceId}/flight-packages/complete` }).then(r => unwrap(r.data as any))

export const unmarkFlightPackageComplete = (instanceId: number): Promise<FlightPackageCompletion> =>
  client.post({ url: `${BASE}/${instanceId}/flight-packages/incomplete` }).then(r => unwrap(r.data as any))

// ─── Task Association (instance) ──────────────────────────────────────────────

export const getTaskAssociations = (instanceId: number): Promise<TaskAssociation[]> =>
  client.get({ url: `${BASE}/${instanceId}/task-associations` }).then(r => unwrap(r.data as any) ?? [])

export const saveTaskAssociations = (
  instanceId: number,
  associations: TaskAssociation[],
): Promise<TaskAssociation[]> =>
  client.post({
    url: `${BASE}/${instanceId}/task-associations`,
    body: {
      associations: associations.map((a) => ({
        task_master_id: a.task_master_id,
        enabling_objective_ids: a.enabling_objectives.map((e) => e.enabling_objective_id),
        currency_master_ids: a.currencies.map((c) => c.currency_master_id),
      })),
    },
    headers: { 'Content-Type': 'application/json' },
  }).then(r => unwrap(r.data as any) ?? [])

export const getEnablingObjectiveOptions = (instanceId: number): Promise<EnablingObjectiveOption[]> =>
  client.get({ url: `${BASE}/${instanceId}/task-associations/enabling-objectives` }).then(r => unwrap(r.data as any) ?? [])

export const markTaskAssociationComplete = (instanceId: number): Promise<TaskAssociationCompletion> =>
  client.post({ url: `${BASE}/${instanceId}/task-associations/complete` }).then(r => unwrap(r.data as any))

export const unmarkTaskAssociationComplete = (instanceId: number): Promise<TaskAssociationCompletion> =>
  client.post({ url: `${BASE}/${instanceId}/task-associations/incomplete` }).then(r => unwrap(r.data as any))

// ─── Flight Pack Association (instance) ───────────────────────────────────────

export const getFlightPackAssociations = (instanceId: number): Promise<FlightPackAssociation[]> =>
  client.get({ url: `${BASE}/${instanceId}/flight-pack-associations` }).then(r => unwrap(r.data as any) ?? [])

export const saveFlightPackAssociations = (
  instanceId: number,
  associations: FlightPackAssociation[],
): Promise<FlightPackAssociation[]> =>
  client.post({
    url: `${BASE}/${instanceId}/flight-pack-associations`,
    body: {
      associations: associations.map((a) => ({
        package_id: a.package_id,
        lesson_ids: a.lessons.map((l) => l.lesson_id),
      })),
    },
    headers: { 'Content-Type': 'application/json' },
  }).then(r => unwrap(r.data as any) ?? [])

export const getFlightPackLessons = (instanceId: number): Promise<LessonOption[]> =>
  client.get({ url: `${BASE}/${instanceId}/flight-pack-associations/lessons` }).then(r => unwrap(r.data as any) ?? [])

export const markFlightPackAssociationComplete = (instanceId: number): Promise<FlightPackAssociationCompletion> =>
  client.post({ url: `${BASE}/${instanceId}/flight-pack-associations/complete` }).then(r => unwrap(r.data as any))

export const unmarkFlightPackAssociationComplete = (instanceId: number): Promise<FlightPackAssociationCompletion> =>
  client.post({ url: `${BASE}/${instanceId}/flight-pack-associations/incomplete` }).then(r => unwrap(r.data as any))


export const getAvailablePackagesForFpa = (instanceId: number): Promise<{ package_id: number; package_name: string }[]> =>
  client.get({ url: `${BASE}/${instanceId}/flight-pack-associations/available-packages` }).then(r => unwrap(r.data as any) ?? [])
