import { client } from '../../../api/client'
import type { GeneralInformationData } from './editor/tabs/GeneralInformationTab'
import type { LessonCreationData } from './editor/tabs/LessonCreationTab'
import type { LessonPlanningData } from './editor/tabs/LessonPlanningTab'
import type { PersonnelRequirementData } from './editor/tabs/PersonnelRequirementTab'
import type { ResourcesData } from './editor/tabs/ResourcesTab'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export interface CourseInfoTabSummary {
  tab_no: string
  tab_name: string
  status: string
}

export interface CourseInfoDetail {
  id: number
  course_master_id: number
  course_title: string
  course_master_status: string
  completion_pct: number
  version: number
  created_by_id: number | null
  updated_by_id: number | null
  created_at: string
  updated_at: string
  tabs: CourseInfoTabSummary[]
  currencies_certificate_completion?: number
}

// Course Information is now keyed directly on the Course Builder master — the
// ``id`` passed to these endpoints is the ``course_master_id``.
export async function getCourseInfo(
  masterId: number,
): Promise<ApiResponse<CourseInfoDetail>> {
  const res = await (client as any).get({ url: `/api/v1/course-infos/${masterId}` })
  return res.data ?? (await res.json())
}

export async function updateCourseInfo(
  masterId: number,
  body: { version: number; course_title?: string },
): Promise<ApiResponse<CourseInfoDetail>> {
  const res = await (client as any).put({
    url: `/api/v1/course-infos/${masterId}`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

// ─── General Information tab (typed) ────────────────────────────────────────

export interface GeneralInformationTabPayload {
  status: string
  data: GeneralInformationData | null
}

export async function getGeneralInformation(
  courseInfoId: number,
): Promise<ApiResponse<GeneralInformationTabPayload>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/general`,
  })
  return res.data ?? (await res.json())
}

export async function upsertGeneralInformation(
  courseInfoId: number,
  body: { status: string; data: GeneralInformationData },
): Promise<ApiResponse<GeneralInformationTabPayload>> {
  const res = await (client as any).put({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/general`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

// Parse a General Course Information .docx and return form data for review.
// Uses a raw fetch (matching the File Sharing upload pattern) so the browser
// sets the multipart/form-data boundary itself — do NOT set Content-Type.
export async function importGeneralInformation(
  courseInfoId: number,
  file: File,
): Promise<ApiResponse<GeneralInformationData>> {
  const formData = new FormData()
  formData.append('file', file)
  const token = localStorage.getItem('access_token')
  const res = await fetch(
    `/api/v1/course-infos/${courseInfoId}/tabs/general/import`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    },
  )
  return (await res.json()) as ApiResponse<GeneralInformationData>
}

// ─── Personnel Requirement tab (typed) ──────────────────────────────────────

export interface PersonnelRequirementTabPayload {
  status: string
  data: PersonnelRequirementData | null
}

export async function getPersonnelRequirement(
  courseInfoId: number,
): Promise<ApiResponse<PersonnelRequirementTabPayload>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/personnel-requirement`,
  })
  return res.data ?? (await res.json())
}

export async function upsertPersonnelRequirement(
  courseInfoId: number,
  body: { status: string; data: PersonnelRequirementData },
): Promise<ApiResponse<PersonnelRequirementTabPayload>> {
  const res = await (client as any).put({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/personnel-requirement`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

// ─── Resources tab (typed) ──────────────────────────────────────────────────

export interface ResourcesTabPayload {
  status: string
  data: ResourcesData | null
}

export async function getResources(
  courseInfoId: number,
): Promise<ApiResponse<ResourcesTabPayload>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/resources`,
  })
  return res.data ?? (await res.json())
}

export async function upsertResources(
  courseInfoId: number,
  body: { status: string; data: ResourcesData },
): Promise<ApiResponse<ResourcesTabPayload>> {
  const res = await (client as any).put({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/resources`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

// Parse a Course Resources .docx and return form data for review.
// Raw fetch so the browser sets the multipart boundary (see importGeneralInformation).
export async function importResources(
  courseInfoId: number,
  file: File,
): Promise<ApiResponse<ResourcesData>> {
  const formData = new FormData()
  formData.append('file', file)
  const token = localStorage.getItem('access_token')
  const res = await fetch(
    `/api/v1/course-infos/${courseInfoId}/tabs/resources/import`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    },
  )
  return (await res.json()) as ApiResponse<ResourcesData>
}

// ─── Lesson Planning tab (typed) ────────────────────────────────────────────

export interface LessonPlanningTabPayload {
  status: string
  data: LessonPlanningData | null
}

export async function getLessonPlanning(
  courseInfoId: number,
): Promise<ApiResponse<LessonPlanningTabPayload>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/lesson-planning`,
  })
  return res.data ?? (await res.json())
}

export async function upsertLessonPlanning(
  courseInfoId: number,
  body: { status: string; data: LessonPlanningData },
): Promise<ApiResponse<LessonPlanningTabPayload>> {
  const res = await (client as any).put({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/lesson-planning`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

// Parse an Instructional Scalar .docx (TO/EO/TP) and return form data for review.
// Raw fetch so the browser sets the multipart boundary (see importGeneralInformation).
export async function importLessonPlanning(
  courseInfoId: number,
  file: File,
): Promise<ApiResponse<LessonPlanningData>> {
  const formData = new FormData()
  formData.append('file', file)
  const token = localStorage.getItem('access_token')
  const res = await fetch(
    `/api/v1/course-infos/${courseInfoId}/tabs/lesson-planning/import`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    },
  )
  return (await res.json()) as ApiResponse<LessonPlanningData>
}

// ─── Lesson Creation tab (typed) ────────────────────────────────────────────

export interface LessonCreationTabPayload {
  status: string
  data: LessonCreationData | null
}

export async function getLessonCreation(
  courseInfoId: number,
): Promise<ApiResponse<LessonCreationTabPayload>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/lesson-creation`,
  })
  return res.data ?? (await res.json())
}

export async function upsertLessonCreation(
  courseInfoId: number,
  body: { status: string; data: LessonCreationData },
): Promise<ApiResponse<LessonCreationTabPayload>> {
  const res = await (client as any).put({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/lesson-creation`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

// Build Lesson Creation from two .docx files: the Detailed Syllabus (lesson
// list) and the Instructional Scalar (TO/EO/TP units). Raw fetch so the browser
// sets the multipart boundary (see importGeneralInformation).
export async function importLessonCreation(
  courseInfoId: number,
  syllabus: File,
  scalar: File,
): Promise<ApiResponse<LessonCreationData>> {
  const formData = new FormData()
  formData.append('syllabus', syllabus)
  formData.append('scalar', scalar)
  const token = localStorage.getItem('access_token')
  const res = await fetch(
    `/api/v1/course-infos/${courseInfoId}/tabs/lesson-creation/import`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    },
  )
  return (await res.json()) as ApiResponse<LessonCreationData>
}

// ─── Resource option dictionary (combo-box suggestions) ─────────────────────

export interface ResourceOption {
  id: number
  label: string
}

export async function listResourceOptions(
  kind: string,
): Promise<ApiResponse<ResourceOption[]>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/resource-options?kind=${encodeURIComponent(kind)}`,
  })
  return res.data ?? (await res.json())
}

export async function createResourceOption(
  kind: string,
  label: string,
): Promise<ApiResponse<ResourceOption>> {
  const res = await (client as any).post({
    url: `/api/v1/course-infos/resource-options`,
    body: { kind, label },
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

// Resources a lesson can attach, grouped by category and scoped to this
// course's Resources tab — feeds the two dependent combos in the lesson editor.
export interface LessonResourceCategoryOption {
  category: string
  categoryLabel: string
  resources: ResourceOption[]
}

export async function listLessonResourceOptions(
  courseInfoId: number,
): Promise<ApiResponse<LessonResourceCategoryOption[]>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/lesson-creation/resource-options`,
  })
  return res.data ?? (await res.json())
}

// ─── Lesson associations (warn-before-delete) ───────────────────────────────

// How many records in each downstream category still reference a single lesson.
// Schedule is master-only; it is always 0 for Course Selection instances.
export interface LessonAssociations {
  material: number
  formBuilder: number
  evaluation: number
  schedule: number
  total: number
}

export async function getLessonAssociations(
  courseInfoId: number,
  lessonId: number,
): Promise<ApiResponse<LessonAssociations>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/lesson-creation/lessons/${lessonId}/associations`,
  })
  return res.data ?? (await res.json())
}

// ─── TP Link Preview tab (derived, read-only) ───────────────────────────────

export interface TpLinkTeachingPoint {
  id: number
  label: string
}

export interface TpLinkEnablingObjective {
  enablingObjectiveId: number | null
  label: string
  teachingPoints: TpLinkTeachingPoint[]
}

export interface TpLinkTrainingObjective {
  trainingObjectiveId: number | null
  label: string
  enablingObjectives: TpLinkEnablingObjective[]
}

export interface TpLinkPreviewData {
  associated: TpLinkTrainingObjective[]
  unassociated: TpLinkTeachingPoint[]
  lessonCreationComplete: boolean
}

export async function getTpLinkPreview(
  courseInfoId: number,
): Promise<ApiResponse<TpLinkPreviewData>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/tp-link-preview`,
  })
  return res.data ?? (await res.json())
}

// ─── Currencies & Certificate tabs ────────────────────────────────────────

export interface CurrencyItem {
  id: number
  name: string
}

export interface CurrenciesTabPayload {
  status: string
  data: {
    availableCurrencies: CurrencyItem[]
    selectedCurrencyIds: number[]
  } | null
}

export async function getCurrencies(
  courseInfoId: number,
): Promise<ApiResponse<CurrenciesTabPayload>> {
  const res = await (client as any).get({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/currencies`,
  })
  return res.data ?? (await res.json())
}

export interface AvailableCurrency {
  id: number
  name: string
}

export interface MasterCourseCurrencyRecord {
  id: number
  course_master_id: number
  currency_master_id: number
}

export async function getAvailableCurrencies(
  masterId: number,
): Promise<ApiResponse<AvailableCurrency[]>> {
  const res = await (client as any).get({
    url: `/api/v1/course-masters/${masterId}/currencies/available`,
  })
  return res.data ?? (await res.json())
}

export async function getMasterCourseCurrencies(
  masterId: number,
): Promise<ApiResponse<MasterCourseCurrencyRecord[]>> {
  const res = await (client as any).get({
    url: `/api/v1/course-masters/${masterId}/currencies/selected`,
  })
  return res.data ?? (await res.json())
}

export async function saveMasterCourseCurrencies(
  masterId: number,
  currencyIds: number[],
): Promise<ApiResponse<MasterCourseCurrencyRecord[]>> {
  const res = await (client as any).post({
    url: `/api/v1/course-masters/${masterId}/currencies/selected`,
    body: { currency_ids: currencyIds },
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

export interface CertificateTabPayload {
  status: string
  data: { certificateUrl: string | null } | null
}

export async function getCertificateUrl(
  masterId: number,
): Promise<ApiResponse<{ certificateUrl: string | null }>> {
  const res = await (client as any).get({
    url: `/api/v1/course-masters/${masterId}/currencies/certification`,
  })
  return res.data ?? (await res.json())
}

export async function upsertCertificate(
  courseInfoId: number,
  body: { status: string; data: { certificateUrl: string | null } },
): Promise<ApiResponse<CertificateTabPayload>> {
  const res = await (client as any).put({
    url: `/api/v1/course-infos/${courseInfoId}/tabs/certificate`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

export async function uploadCertificate(
  masterId: number,
  file: File,
): Promise<ApiResponse<{ certificateUrl: string }>> {
  const formData = new FormData()
  formData.append('file', file)
  const token = localStorage.getItem('access_token')
  const res = await fetch(
    `/api/v1/course-masters/${masterId}/currencies/certification/upload`,
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    },
  )
  return (await res.json()) as ApiResponse<{ certificateUrl: string }>
}

export interface CurrencyCertTabCompletion {
  tab: string
  tab_status: string
  currencies_certificate_completion: number
}

export async function markCurrenciesCertComplete(
  masterId: number,
  tabNo: 'currencies' | 'certificate',
): Promise<ApiResponse<CurrencyCertTabCompletion>> {
  const res = await (client as any).post({
    url: `/api/v1/course-masters/${masterId}/currencies/${tabNo}/complete`,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

export async function unmarkCurrenciesCertComplete(
  masterId: number,
  tabNo: 'currencies' | 'certificate',
): Promise<ApiResponse<CurrencyCertTabCompletion>> {
  const res = await (client as any).post({
    url: `/api/v1/course-masters/${masterId}/currencies/${tabNo}/incomplete`,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}
