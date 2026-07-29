// API for grading feature - real API calls to database
import { client } from '../../../api/client'
import * as sdk from '../../../api/generated'

// Re-export helpers from course-selection for fetching associated quizzes/surveys/forms
export {
  listAllQuizzes,
} from '../../course-management/course-selection/evaluation/course-selection-evaluation-api'
export type {
  EvaluationQuiz,
  EvaluationLesson,
} from '../../course-management/course-selection/evaluation/course-selection-evaluation-api'
export {
  listSurveyLinks,
  listFormLinks,
  listAllSurveyLinks,
  listAllFormLinks,
} from '../../course-management/course-selection/form/course-selection-form-api'
export {
  getFlightPackages,
} from '../../course-management/currencies-certificate/currencies-cert-api'

export interface QuizGradingPayload {
  student_id: number
  quiz_id: number
  question_id: number
  score: number
  note?: string
}

export interface SurveyGradingPayload {
  student_id: number
  survey_id: number
  question_id: number
  score: number
  note?: string
}

export interface FormGradingPayload {
  student_id: number
  form_id: number
  question_id: number
  score: number
  note?: string
}

// Fetch quiz questions for a given quiz (from quiz bank)
export async function fetchQuizQuestions(quizId: number) {
  // Quiz bank questions endpoint
  const res = await client.get({ url: `/api/v1/quiz-bank/quizzes/${quizId}/questions` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch quiz questions')
  return data.data
}

// Fetch survey with its questions
export async function fetchSurveyWithQuestions(surveyId: number) {
  const res = await client.get({ url: `/api/v1/survey/surveys/${surveyId}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch survey')
  return data.data
}

// Fetch form with its questions
export async function fetchFormWithQuestions(formId: number) {
  const res = await client.get({ url: `/api/v1/form/forms/${formId}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch form')
  return data.data
}

// Save quiz grading
export async function saveQuizGrading(payload: QuizGradingPayload) {
  const res = await client.post({
    url: `/api/v1/grading/quiz-grades`,
    body: payload,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save quiz grading')
  return (res.data as any).data
}

// Save survey grading
export async function saveSurveyGrading(payload: SurveyGradingPayload) {
  const res = await client.put({
    url: `/api/v1/grading/survey-grades`,
    body: payload,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save survey grading')
  return (res.data as any).data
}

// Save form grading
export async function saveFormGrading(payload: FormGradingPayload) {
  const res = await client.put({
    url: `/api/v1/grading/form-grades`,
    body: payload,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save form grading')
  return (res.data as any).data
}

// Save all form grading (batch)
export async function saveAllFormGrading(payloads: FormGradingPayload[]) {
  const res = await client.put({
    url: `/api/v1/grading/form-grades/batch`,
    body: payloads,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save all form grading')
  return (res.data as any).data
}

export interface SaveAllSurveyGradingEntry {
  student_id: number
  survey_id: number
  response_id: number
  question_id: number
  score: number
  note?: string
}

// Save all survey grading (batch)
export async function saveAllSurveyGrading(payloads: SaveAllSurveyGradingEntry[]) {
  const res = await client.put({
    url: '/api/v1/grading/survey-grades/batch',
    body: payloads,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save all survey grading')
  return (res.data as any).data
}

// Fetch student responses for a survey
export async function fetchStudentSurveyResponses(surveyId: number) {
  const res = await client.get({ url: `/api/v1/survey/surveys/studentrespones?survey_id=${surveyId}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch responses')
  return data.data
}

// Fetch student responses for a form
export async function fetchStudentFormResponses(formId: number) {
  const res = await client.get({ url: `/api/v1/form/forms/studentrespones?form_id=${formId}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch form responses')
  return data.data
}

export interface SaveAllQuizGradingEntry {
  studentId: number
  quizId: number
  question_id: number
  score: number
  note?: string
}

// Save all quiz grading at once
export async function saveAllQuizGrading(grades: SaveAllQuizGradingEntry[]) {
  const res = await client.post({
    url: `/api/v1/grading/quiz-grades/batch`,
    body: { grades },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save all quiz grading')
  return (res.data as any).data
}

// ─── Flight Pack Grading (new API for grading-attendance) ─────────────────────

export interface GradingFlightPackTaskGrade {
  task_id: number
  pack_id: number
  task_no: string
  task_desc: string
  satisfied: boolean | null
  score: number | null
  note: string | null
}

export interface GradingFlightPkPack {
  pack_id: number
  name: string
  tasks: GradingFlightPackTaskGrade[]
}

export interface FlightPackFillRecord {
  pack_id: number
  student_name: string
  rank: string
  date: string
  sortie_number: string
  sortie_detail: string
  hour_day: string
  hour_night: string
  hour_nvg: string
  hour_total: string
  inst_simulated: string
  inst_actual: string
  inst_approaches: string
  inst_ils: string
  inst_vor: string
  grade_sortie: string
  grade_illum: string
  grade_weather: string
}

export interface GradingFlightPackagesResponse {
  packages: GradingFlightPkPack[]
  fills: FlightPackFillRecord[]
  served_at: string
}

export interface FlightPackFillPayload {
  course_instance_id: number
  student_id: number
  pack_id: number
  student_name: string
  rank: string
  date: string
  sortie_number: string
  sortie_detail: string
  hour_day: string
  hour_night: string
  hour_nvg: string
  hour_total: string
  inst_simulated: string
  inst_actual: string
  inst_approaches: string
  inst_ils: string
  inst_vor: string
  grade_sortie: string
  grade_illum: string
  grade_weather: string
}

export interface FlightPackGradeEntry {
  student_id: number
  course_instance_id: number
  pack_id: number
  task_id: number
  satisfied: boolean | null
  score: number | null
  note: string | null
}

// Fetch flight packages + tasks + saved grades + fill datafor a course
export async function fetchGradingFlightPackages(courseId: number, studentId?: number) {
  const query = studentId ? `?student_id=${studentId}` : ''
  const res = await client.get({ url: `/api/v1/grading/course/${courseId}/flight-packages${query}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch flight pack grading data')
  return data.data as GradingFlightPackagesResponse
}

// Save/update flight pack fill data (one record per pack per student, upsert)
export async function saveFlightPackFill(payload: FlightPackFillPayload) {
  const res = await client.put({
    url: '/api/v1/grading/flight-pack-fill',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save flight pack fill')
  return (res.data as any).data
}

// Individual flight pack task grade save
export async function saveFlightPackGrading(entry: FlightPackGradeEntry) {
  const res = await client.post({
    url: '/api/v1/grading/flight-pack-grades',
    body: entry,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save flight pack grading')
  return (res.data as any).data
}

// Batch flight pack grading (saves all tasks at once)
export async function saveAllFlightPackGrading(entries: FlightPackGradeEntry[]) {
  const res = await client.put({
    url: '/api/v1/grading/flight-pack-grades/batch',
    body: entries,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save all flight pack grading')
  return (res.data as any).data
}

// Fetch quiz attempts for a student
export async function fetchQuizAttempts(studentId: number|null) {
  const res = await client.get({
    url: '/api/v1/quiz-bank/attempts' + (studentId ? `?student_id=${studentId}` : '')
  })
  const data = (res.data as any)
  if (!data?.data) throw new Error('Failed to fetch quiz attempts')
  return data.data
}

// ---------------------------------------------------------------------------
// NEW: Unified course-selection assignment endpoints
// ---------------------------------------------------------------------------

export interface GradingQuizEntity {
  question_id: number
  quiz_id: number
  question_text: string
  question_type: string
  weight: number
  choices: string[] | null
  grade: number | null
  note: string | null
}

export interface GradingQuizResponse {
  quiz_ids: number[]
  questions: GradingQuizEntity[]
}

export interface GradingQuizAnswerOption {
  id: number
  text: string
  weight: number | null
}

export interface GradingSurveyQuestionEntity {
  question_id: number
  survey_id: number
  question_text: string
  question_type: string
  weight: number
  allow_multiple: boolean
  options: GradingQuizAnswerOption[]
  grade: number | null
  note: string | null
}

export interface GradingSurveyResponse {
  survey_ids: number[]
  questions: GradingSurveyQuestionEntity[]
}

export interface GradingFormAnswerOption {
  id: number
  text: string
  weight: number | null
}

export interface GradingFormQuestionEntity {
  question_id: number
  form_id: number
  question_text: string
  question_type: string
  weight: number
  allow_multiple: boolean
  options: GradingFormAnswerOption[]
  grade: number | null
  note: string | null
}

export interface GradingFormResponse {
  form_ids: number[]
  questions: GradingFormQuestionEntity[]
}

/** Fetch quizzes + questions assigned to a course */
export async function fetchGradingQuizEntities(courseId: number, studentId?: number) {
  const query = studentId ? `?student_id=${studentId}` : ''
  const res = await client.get({ url: `/api/v1/grading/course/${courseId}/quizzes${query}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch quiz entities')
  return data.data as GradingQuizResponse
}

/** Fetch surveys + questions assigned to a course */
export async function fetchGradingSurveyEntities(courseId: number, studentId?: number) {
  const query = studentId ? `?student_id=${studentId}` : ''
  const res = await client.get({ url: `/api/v1/grading/course/${courseId}/surveys${query}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch survey entities')
  return data.data as GradingSurveyResponse
}

/** Fetch forms + questions assigned to a course */
export async function fetchGradingFormEntities(courseId: number, studentId?: number) {
  const query = studentId ? `?student_id=${studentId}` : ''
  const res = await client.get({ url: `/api/v1/grading/course/${courseId}/forms${query}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch form entities')
  return data.data as GradingFormResponse
}

export interface SaveAllQuizGradingEntryNew {
  student_id: number
  quiz_id: number
  question_id: number
  score: number
  note?: string
}

// Save all quiz grading at once (uses new snake_case field names)
export async function saveAllQuizGradingNew(grades: SaveAllQuizGradingEntryNew[]) {
  const res = await client.post({
    url: `/api/v1/grading/quiz-grades/batch`,
    body: { grades },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save all quiz grading')
  return (res.data as any).data
}

// Fetch student response for a survey (for grading)
export async function fetchSurveyStudentResponse(surveyId: number, studentId: number) {
  const res = await client.get({ url: `/api/v1/grading/survey/${surveyId}/response?student_id=${studentId}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch response')
  return data.data
}

// Fetch student response for a form (for grading)
export async function fetchFormStudentResponse(formId: number, studentId: number) {
  const res = await client.get({ url: `/api/v1/grading/form/${formId}/response?student_id=${studentId}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch response')
  return data.data
}

// Fetch student quiz attempt (for grading)
export async function fetchQuizAttempt(quizId: number, studentId: number) {
  const res = await client.get({ url: `/api/v1/grading/quiz/${quizId}/attempt?student_id=${studentId}` })
  const data = (res.data as any)
  if (!data?.success) throw new Error('Failed to fetch attempt')
  return data.data
}

export interface SaveAllSurveyGradingEntryNew {
  student_id: number
  survey_id: number | null
  question_id: number
  score: number
  note?: string
}

// Save all survey grading (batch)
export async function saveAllSurveyGradingNew(payloads: SaveAllSurveyGradingEntryNew[]) {
  const res = await client.put({
    url: '/api/v1/grading/survey-grades/batch',
    body: payloads,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save all survey grading')
  return (res.data as any).data
}

export interface SaveAllFormGradingPayloadNew {
  student_id: number
  form_id: number | null
  question_id: number
  score: number
  note?: string
}

// Save all form grading (batch)
export async function saveAllFormGradingNew(payloads: SaveAllFormGradingPayloadNew[]) {
  const res = await client.put({
    url: `/api/v1/grading/form-grades/batch`,
    body: payloads,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!((res.data as any)?.success)) throw new Error('Failed to save all form grading')
  return (res.data as any).data
}
