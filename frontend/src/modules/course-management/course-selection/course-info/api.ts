// Course Selection (instance) Course Information api. Mirrors the master
// `course-info/api.ts` function-by-function but targets the instance base path
// `/api/v1/course-selection-info`. Wired into the shared editor via the
// CourseInfoApiProvider, so the same editor UI drives instance endpoints.
import { client } from '../../../../api/client'
import type {
  ApiResponse,
  CourseInfoDetail,
  GeneralInformationTabPayload,
  LessonAssociations,
  LessonCreationTabPayload,
  LessonPlanningTabPayload,
  LessonResourceCategoryOption,
  PersonnelRequirementTabPayload,
  ResourcesTabPayload,
  TpLinkPreviewData,
} from '../../course-info/api'
import type { GeneralInformationData } from '../../course-info/editor/tabs/GeneralInformationTab'
import type { LessonCreationData } from '../../course-info/editor/tabs/LessonCreationTab'
import type { LessonPlanningData } from '../../course-info/editor/tabs/LessonPlanningTab'
import type { PersonnelRequirementData } from '../../course-info/editor/tabs/PersonnelRequirementTab'
import type { ResourcesData } from '../../course-info/editor/tabs/ResourcesTab'

const BASE = '/api/v1/course-selection-info'

// The instance has no optimistic-lock `version` and exposes `course_status`
// rather than `course_master_status`. Adapt the detail to the shape the shared
// editor expects (constant version:0 makes its version branches no-ops).
function adaptDetail(body: any): ApiResponse<CourseInfoDetail> {
  if (body?.success && body.data) {
    const d = body.data
    return {
      success: true,
      data: { ...d, version: 0, course_master_status: d.course_status },
    }
  }
  return body
}

export async function getCourseInfo(id: number): Promise<ApiResponse<CourseInfoDetail>> {
  const res = await (client as any).get({ url: `${BASE}/${id}` })
  return adaptDetail(res.data ?? (await res.json()))
}

export async function updateCourseInfo(
  id: number,
  body: { version: number; course_title?: string },
): Promise<ApiResponse<CourseInfoDetail>> {
  const res = await (client as any).put({
    url: `${BASE}/${id}`,
    body: { course_title: body.course_title },
    headers: { 'Content-Type': 'application/json' },
  })
  return adaptDetail(res.data ?? (await res.json()))
}

// ─── Typed tab read/write (identical shapes to the master) ──────────────────

export async function getGeneralInformation(id: number): Promise<ApiResponse<GeneralInformationTabPayload>> {
  const res = await (client as any).get({ url: `${BASE}/${id}/tabs/general` })
  return res.data ?? (await res.json())
}

export async function upsertGeneralInformation(
  id: number,
  body: { status: string; data: GeneralInformationData },
): Promise<ApiResponse<GeneralInformationTabPayload>> {
  const res = await (client as any).put({
    url: `${BASE}/${id}/tabs/general`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

export async function getPersonnelRequirement(id: number): Promise<ApiResponse<PersonnelRequirementTabPayload>> {
  const res = await (client as any).get({ url: `${BASE}/${id}/tabs/personnel-requirement` })
  return res.data ?? (await res.json())
}

export async function upsertPersonnelRequirement(
  id: number,
  body: { status: string; data: PersonnelRequirementData },
): Promise<ApiResponse<PersonnelRequirementTabPayload>> {
  const res = await (client as any).put({
    url: `${BASE}/${id}/tabs/personnel-requirement`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

export async function getResources(id: number): Promise<ApiResponse<ResourcesTabPayload>> {
  const res = await (client as any).get({ url: `${BASE}/${id}/tabs/resources` })
  return res.data ?? (await res.json())
}

export async function upsertResources(
  id: number,
  body: { status: string; data: ResourcesData },
): Promise<ApiResponse<ResourcesTabPayload>> {
  const res = await (client as any).put({
    url: `${BASE}/${id}/tabs/resources`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

export async function getLessonPlanning(id: number): Promise<ApiResponse<LessonPlanningTabPayload>> {
  const res = await (client as any).get({ url: `${BASE}/${id}/tabs/lesson-planning` })
  return res.data ?? (await res.json())
}

export async function upsertLessonPlanning(
  id: number,
  body: { status: string; data: LessonPlanningData },
): Promise<ApiResponse<LessonPlanningTabPayload>> {
  const res = await (client as any).put({
    url: `${BASE}/${id}/tabs/lesson-planning`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

export async function getLessonCreation(id: number): Promise<ApiResponse<LessonCreationTabPayload>> {
  const res = await (client as any).get({ url: `${BASE}/${id}/tabs/lesson-creation` })
  return res.data ?? (await res.json())
}

export async function upsertLessonCreation(
  id: number,
  body: { status: string; data: LessonCreationData },
): Promise<ApiResponse<LessonCreationTabPayload>> {
  const res = await (client as any).put({
    url: `${BASE}/${id}/tabs/lesson-creation`,
    body,
    headers: { 'Content-Type': 'application/json' },
  })
  return res.data ?? (await res.json())
}

// ─── .docx imports (raw fetch so the browser sets the multipart boundary) ───

async function importDocx<T>(url: string, fields: Record<string, File>): Promise<ApiResponse<T>> {
  const formData = new FormData()
  for (const [name, file] of Object.entries(fields)) formData.append(name, file)
  const token = localStorage.getItem('access_token')
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  return (await res.json()) as ApiResponse<T>
}

export function importGeneralInformation(id: number, file: File): Promise<ApiResponse<GeneralInformationData>> {
  return importDocx(`${BASE}/${id}/tabs/general/import`, { file })
}

export function importResources(id: number, file: File): Promise<ApiResponse<ResourcesData>> {
  return importDocx(`${BASE}/${id}/tabs/resources/import`, { file })
}

export function importLessonPlanning(id: number, file: File): Promise<ApiResponse<LessonPlanningData>> {
  return importDocx(`${BASE}/${id}/tabs/lesson-planning/import`, { file })
}

export function importLessonCreation(
  id: number,
  syllabus: File,
  scalar: File,
): Promise<ApiResponse<LessonCreationData>> {
  return importDocx(`${BASE}/${id}/tabs/lesson-creation/import`, { syllabus, scalar })
}

// ─── Course-scoped read-only helpers ────────────────────────────────────────

export async function listLessonResourceOptions(id: number): Promise<ApiResponse<LessonResourceCategoryOption[]>> {
  const res = await (client as any).get({
    url: `${BASE}/${id}/tabs/lesson-creation/resource-options`,
  })
  return res.data ?? (await res.json())
}

export async function getLessonAssociations(
  id: number,
  lessonId: number,
): Promise<ApiResponse<LessonAssociations>> {
  const res = await (client as any).get({
    url: `${BASE}/${id}/tabs/lesson-creation/lessons/${lessonId}/associations`,
  })
  return res.data ?? (await res.json())
}

// Instance-only: the ids of this instance's Lesson Creation lessons whose
// content has drifted from the master they were cloned from. Drives the
// per-lesson "Modified" badge in the shared editor's lesson list. The master
// (Course Builder) api intentionally does not implement this — it has no master
// to diff against — so the badge only appears in Course Selection.
export async function getLessonCreationModifiedLessons(
  id: number,
): Promise<ApiResponse<{ modified_lesson_ids: number[] }>> {
  const res = await (client as any).get({
    url: `${BASE}/${id}/tabs/lesson-creation/modified-lessons`,
  })
  return res.data ?? (await res.json())
}

export async function getTpLinkPreview(id: number): Promise<ApiResponse<TpLinkPreviewData>> {
  const res = await (client as any).get({ url: `${BASE}/${id}/tabs/tp-link-preview` })
  return res.data ?? (await res.json())
}
