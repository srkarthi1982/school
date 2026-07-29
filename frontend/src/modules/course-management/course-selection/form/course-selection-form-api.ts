import '../../../../api/client'

export interface FormBuilderDetail {
  id: number
  course_instance_id: number
  title: string
  status: 'incomplete' | 'complete'
  course_status: string
  surveys_completion: number
  // True when any survey/form link differs from the master; ``course_modified``
  // is the whole-course (non-lesson) scope specifically.
  modified?: boolean
  course_modified?: boolean
}

export interface FormBuilderStatus {
  form_builder_id: number
  status: 'incomplete' | 'complete'
  surveys_completion: number
}

export interface FormBuilderLesson {
  id: number
  lesson_number: string | null
  lesson_title: string | null
  order_index: number
  survey_count: number
  form_count: number
  // True when this lesson's survey/form links differ from the master.
  modified?: boolean
}

export interface FormBuilderSurvey {
  id: number // association (link) id
  survey_id: number
  lesson_id: number | null // null = course-level association
  title: string
  description: string | null
  status: string
  question_count: number
  order_index: number
  created_at: string
}

// A survey that can be picked from the Survey module to associate.
export interface SurveyOption {
  id: number
  title: string
  description: string | null
  status: string
  questions: unknown[]
}

export interface FormBuilderForm {
  id: number // association (link) id
  form_id: number
  lesson_id: number | null // null = course-level association
  title: string
  description: string | null
  status: string
  question_count: number
  order_index: number
  created_at: string
}

// A form that can be picked from the Form module to associate.
export interface FormOption {
  id: number
  title: string
  description: string | null
  status: string
  questions: unknown[]
}

interface ApiEnvelope<T> {
  success?: boolean
  data?: T
  error?: { message?: string }
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

// --- Form (per course instance) ---

// Seeds the instance's survey/form links from its master on first call.
export const ensureInstanceFormBuilder = (courseId: number): Promise<FormBuilderDetail> =>
  apiFetch(`/courses/${courseId}/form-builder`, { method: 'POST' })

export const markFormBuilderComplete = (formBuilderId: number): Promise<FormBuilderStatus> =>
  apiFetch(`/course-selection-form-builders/${formBuilderId}/complete`, { method: 'POST' })

export const unmarkFormBuilderComplete = (formBuilderId: number): Promise<FormBuilderStatus> =>
  apiFetch(`/course-selection-form-builders/${formBuilderId}/incomplete`, { method: 'POST' })

// --- Lessons ---

export const listFormBuilderLessons = (
  formBuilderId: number,
): Promise<{ items: FormBuilderLesson[]; total: number }> =>
  apiFetch(`/course-selection-form-builders/${formBuilderId}/lessons`)

// --- Survey links (lesson ↔ survey, or course ↔ survey when lessonId is null) ---

export const listSurveyLinks = (
  formBuilderId: number,
  lessonId: number | null,
): Promise<{ items: FormBuilderSurvey[]; total: number }> => {
  const query = lessonId == null ? '' : `?lesson_id=${lessonId}`
  return apiFetch(`/course-selection-form-builders/${formBuilderId}/surveys${query}`)
}

export const listAllSurveyLinks = (
  formBuilderId: number,
): Promise<{ items: FormBuilderSurvey[]; total: number }> =>
  apiFetch(`/course-selection-form-builders/${formBuilderId}/surveys/all`)

export const associateSurvey = (
  formBuilderId: number,
  lessonId: number | null,
  surveyId: number,
): Promise<FormBuilderSurvey> =>
  apiFetch(`/course-selection-form-builders/${formBuilderId}/surveys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson_id: lessonId, survey_id: surveyId }),
  })

export const dissociateSurvey = (linkId: number): Promise<void> =>
  apiFetch(`/course-selection-form-builders/surveys/${linkId}`, { method: 'DELETE' })

// --- Survey module (picker source) ---

export const listSurveys = async (): Promise<SurveyOption[]> => {
  const items = await apiFetch<SurveyOption[]>(`/survey/surveys`)
  return items ?? []
}

// --- Form links (lesson ↔ form, or course ↔ form when lessonId is null) ---

export const listFormLinks = (
  formBuilderId: number,
  lessonId: number | null,
): Promise<{ items: FormBuilderForm[]; total: number }> => {
  const query = lessonId == null ? '' : `?lesson_id=${lessonId}`
  return apiFetch(`/course-selection-form-builders/${formBuilderId}/forms${query}`)
}

export const listAllFormLinks = (
  formBuilderId: number,
): Promise<{ items: FormBuilderForm[]; total: number }> =>
  apiFetch(`/course-selection-form-builders/${formBuilderId}/forms/all`)

export const associateForm = (
  formBuilderId: number,
  lessonId: number | null,
  formId: number,
): Promise<FormBuilderForm> =>
  apiFetch(`/course-selection-form-builders/${formBuilderId}/forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson_id: lessonId, form_id: formId }),
  })

export const dissociateForm = (linkId: number): Promise<void> =>
  apiFetch(`/course-selection-form-builders/forms/${linkId}`, { method: 'DELETE' })

// --- Form module (picker source) ---

export const listForms = async (): Promise<FormOption[]> => {
  const items = await apiFetch<FormOption[]>(`/form/forms`)
  return items ?? []
}
