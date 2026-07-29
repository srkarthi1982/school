import '../../../api/client'

export interface EvaluationDetail {
  id: number
  course_master_id: number
  title: string
  status: 'incomplete' | 'complete'
  course_master_status: string
  course_master_completion: number
}

export interface EvaluationStatus {
  evaluation_id: number
  status: 'incomplete' | 'complete'
  course_master_completion: number
}

export interface EvaluationLesson {
  id: number
  lesson_number: string | null
  lesson_title: string | null
  order_index: number
  quiz_count: number
  form_count: number
}

export type AssessmentType = 'theory' | 'practical'

export interface EvaluationQuiz {
  id: number // association id
  quiz_id: number
  lesson_id: number | null // null = course-level association
  name: string
  description: string | null
  type: string | null
  status: string
  weight: number
  question_count: number
  order_index: number
  assessment_type: AssessmentType | null
  max_mark: number
  pass_mark: number
  pass_percentage: number
  percentage_allocation: number
  created_at: string
}

export interface AssociateQuizInput {
  assessmentType: AssessmentType | null
  maxMark: number
  passMark: number
  passPercentage: number
  percentageAllocation: number
}

// A quiz that can be picked from the Quiz Bank (only approved ones are usable).
export interface QuizOption {
  id: number
  name: string
  description: string | null
  type: string | null
  status: string
  weight: number
  questions: unknown[]
}

// A form linked to a lesson (or the course) within the Evaluation. A plain
// attachment — no assessment config, unlike quizzes.
export interface EvaluationForm {
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

// --- Evaluation (per course master) ---

export const ensureCourseMasterEvaluation = (masterId: number): Promise<EvaluationDetail> =>
  apiFetch(`/course-masters/${masterId}/evaluation`, { method: 'POST' })

export const markEvaluationComplete = (evaluationId: number): Promise<EvaluationStatus> =>
  apiFetch(`/evaluations/${evaluationId}/complete`, { method: 'POST' })

export const unmarkEvaluationComplete = (evaluationId: number): Promise<EvaluationStatus> =>
  apiFetch(`/evaluations/${evaluationId}/incomplete`, { method: 'POST' })

// --- Lessons ---

export const listEvaluationLessons = (
  evaluationId: number,
): Promise<{ items: EvaluationLesson[]; total: number }> =>
  apiFetch(`/evaluations/${evaluationId}/lessons`)

// --- Quiz associations (lesson ↔ quiz, or course ↔ quiz when lessonId is null) ---

export const listLessonQuizzes = (
  evaluationId: number,
  lessonId: number | null,
): Promise<{ items: EvaluationQuiz[]; total: number }> => {
  const query = lessonId == null ? '' : `?lesson_id=${lessonId}`
  return apiFetch(`/evaluations/${evaluationId}/quizzes${query}`)
}

export const listAllQuizzes = (
  evaluationId: number,
): Promise<{ items: EvaluationQuiz[]; total: number }> =>
  apiFetch(`/evaluations/${evaluationId}/quizzes/all`)

export const associateQuiz = (
  evaluationId: number,
  lessonId: number | null,
  quizId: number,
  input: AssociateQuizInput,
): Promise<EvaluationQuiz> =>
  apiFetch(`/evaluations/${evaluationId}/quizzes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lesson_id: lessonId,
      quiz_id: quizId,
      assessment_type: input.assessmentType,
      max_mark: input.maxMark,
      pass_mark: input.passMark,
      pass_percentage: input.passPercentage,
      percentage_allocation: input.percentageAllocation,
    }),
  })

export const updateQuizAssociation = (
  assocId: number,
  input: AssociateQuizInput,
): Promise<EvaluationQuiz> =>
  apiFetch(`/evaluations/quizzes/${assocId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assessment_type: input.assessmentType,
      max_mark: input.maxMark,
      pass_mark: input.passMark,
      pass_percentage: input.passPercentage,
      percentage_allocation: input.percentageAllocation,
    }),
  })

export const dissociateQuiz = (assocId: number): Promise<void> =>
  apiFetch(`/evaluations/quizzes/${assocId}`, { method: 'DELETE' })

// --- Quiz Bank (picker source) ---

export const listApprovedQuizzes = async (): Promise<QuizOption[]> => {
  const items = await apiFetch<QuizOption[]>(`/quiz-bank/quizzes`)
  return (items ?? []).filter((q) => q.status === 'approved')
}

// --- Form associations (lesson ↔ form, or course ↔ form when lessonId is null) ---

export const listEvaluationForms = (
  evaluationId: number,
  lessonId: number | null,
): Promise<{ items: EvaluationForm[]; total: number }> => {
  const query = lessonId == null ? '' : `?lesson_id=${lessonId}`
  return apiFetch(`/evaluations/${evaluationId}/forms${query}`)
}

export const listAllEvaluationForms = (
  evaluationId: number,
): Promise<{ items: EvaluationForm[]; total: number }> =>
  apiFetch(`/evaluations/${evaluationId}/forms/all`)

export const associateForm = (
  evaluationId: number,
  lessonId: number | null,
  formId: number,
): Promise<EvaluationForm> =>
  apiFetch(`/evaluations/${evaluationId}/forms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson_id: lessonId, form_id: formId }),
  })

export const dissociateForm = (linkId: number): Promise<void> =>
  apiFetch(`/evaluations/forms/${linkId}`, { method: 'DELETE' })

// --- Form module (picker source) ---

export const listForms = async (): Promise<FormOption[]> => {
  const items = await apiFetch<FormOption[]>(`/form/forms`)
  return items ?? []
}
