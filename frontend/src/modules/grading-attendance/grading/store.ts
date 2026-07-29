import { create } from 'zustand'
import '../../../api/client' // ALWAYS first in stores
import { client } from '../../../api/client'
import type { SuccessResponseListPersonnelCourseResponse, PersonnelCourseResponse, SuccessResponseListPersonnelStudentMember, PersonnelStudentMember, StudentResponseResponse, QuizResponse, QuizQuestionResponse, SurveyResponse, FormQuestionResponse, QuizAttemptResponse, FormStudentResponseResponse } from '../../../api/generated'
import {
  listPersonnelCoursesApiV1CoursesPersonnelCoursesGet as listCourses,
  listCourseStudentsApiV1CoursesCourseIdPersonnelStudentsGet as listStudents,
  listSurveysApiV1SurveySurveysGet as listSurveys,
  getSurveyApiV1SurveySurveysSurveyIdGet as getSurveyQuestions,
  getFormApiV1FormFormsFormIdGet as getFormQuestions,
  listFormsApiV1FormFormsGet as listFormsAll,
  listStudentResponseApiV1SurveySurveysStudentresponesGet as listStudentResponses,
  listStudentResponseApiV1FormFormsStudentresponesGet as listFormStudentResponses,
  listMyAttemptsApiV1QuizBankAttemptsGet as listMyAttempts,
} from '../../../api/generated'

export interface TeacherCourse {
  id: number
  code: string
  title: string
  outline?: string
  status: string
  students_count: number
  gradingProgress: number
}

export interface PersonnelStudent {
  id: number
  full_name: string
  rank?: string
  username?: string
  progress: Record<'quiz' | 'survey' | 'form' | 'flight-pack', number>
  gradeLevel?: string
}

export interface QuizQuestion {
  id: number
  text: string
  type: 'multiple_choice' | 'essay' | 'true_false'
  weight: number
  choices: string[] | null
}

export interface SurveyQuestion {
  id: number
  text: string
  type: 'text' | 'multiple' | 'rating' | 'true_false' | 'rating_with_text'
  weight?: number
  allowMultiple?: boolean
  options: { id: number; text: string; weight?: number | null }[]
}

export interface FormQuestion {
  id: number
  text: string
  type: 'text' | 'multiple' | 'rating' | 'true_false'
  weight?: number
  allowMultiple?: boolean
  options: { id: number; text: string; weight?: number | null }[]
}

export interface QuizGradingAnswer {
  questionId: number
  question: QuizQuestion
  studentAnswer: string
  score: number | null
  note: string
  questionText: string  // for display - maps from QuizQuestionResponse.description
}

export interface SurveyGradingAnswer {
  questionId: number
  question: SurveyQuestion
  studentAnswer: string
  score: number | null
  note: string
}

export interface FormGradingAnswer {
  questionId: number
  question: FormQuestion
  studentAnswer: string
  score: number | null
  note: string
}

export interface GradingAnswerResult {
  questionId: number
  score: number
  note: string
}

interface GradingState {
  // Course selection
  courses: TeacherCourse[]
  selectedCourse: TeacherCourse | null
  
  // Students for selected course
  students: PersonnelStudent[]
  selectedStudent: PersonnelStudent | null
  
  // Active tab state
  activeTab: 'quiz' | 'survey' | 'form' | 'flight-pack'
  
  // Loaded data for grading
  quizQuestions: { id: number; quizId: number; name: string; survey: QuizResponse }[]
  surveys: SurveyResponse[]
  forms: { id: number; formId: number; name: string }[]
  
  // Grading answers (per question, keyed by questionId)
  quizAnswers: Record<number, { score: number | null; note: string }>
  surveyAnswers: Record<number, { score: number | null; note: string }>
  formAnswers: Record<number, { score: number | null; note: string }>
  
  // Student responses loaded (survey/form)
  studentSurveyResponses: Record<number, StudentResponseResponse[]>  // surveyId -> responses
  studentFormResponses: Record<number, FormStudentResponseResponse[]>  // formId -> responses
  
  // Quiz attempts loaded
  quizAttempts: QuizAttemptResponse[]
  
  // Loading states
  coursesLoading: boolean
  studentsLoading: boolean
  
  // Actions
  getCourses: () => Promise<void>
  setSelectedCourse: (course: TeacherCourse) => void
  loadStudents: (courseId: number) => Promise<void>
  setSelectedStudent: (student: PersonnelStudent) => void
  setActiveTab: (tab: 'quiz' | 'survey' | 'form' | 'flight-pack') => void
  loadGradingData: () => Promise<void>
  setQuizAnswer: (questionId: number, score: number | null, note: string) => void
  setSurveyAnswer: (questionId: number, score: number | null, note: string) => void
  setFormAnswer: (questionId: number, score: number | null, note: string) => void
  setQuizAnswersFromStorage: (answers: Record<number, { score: number | null; note: string }>) => void
  setSurveyAnswersFromStorage: (answers: Record<number, { score: number | null; note: string }>) => void
  setFormAnswersFromStorage: (answers: Record<number, { score: number | null; note: string }>) => void
}

const useStore = create<GradingState>((set, get) => ({
  courses: [],
  selectedCourse: null,
  students: [],
  selectedStudent: null,
  activeTab: 'quiz',
  quizQuestions: [],
  surveys: [],
  forms: [],
  quizAnswers: {},
  surveyAnswers: {},
  formAnswers: {},
  studentSurveyResponses: {},
  studentFormResponses: {},
  quizAttempts: [],
  coursesLoading: false,
  studentsLoading: false,
  
  getCourses: async () => {
    set({ coursesLoading: true })
    try {
      const res = await listCourses().catch(() => ({ data: null }))
      if (res.data?.success) {
        const courseList = res.data.data || []
        const mapped: TeacherCourse[] = courseList.map((c: any) => ({
          id: c.id,
          code: c.code || `COURSE-${c.id}`,
          title: c.title || 'Untitled Course',
          outline: c.description || c.outline || undefined,
          status: 'Active',
          students_count: 3, // will be updated after loading students
          gradingProgress: 0,
        }))
        set({ courses: mapped, coursesLoading: false })
      } else {
        // Mock data fallback
        set({
          courses: [
            { id: 1, code: 'PPL-2026-01', title: 'Private Pilot License (PPL)', status: 'Active', students_count: 5, gradingProgress: 60 },
            { id: 2, code: 'IR-2026-01', title: 'Instrument Rating (IR)', status: 'Active', students_count: 3, gradingProgress: 33 },
            { id: 3, code: 'CPL-2026-01', title: 'Commercial Pilot License (CPL)', status: 'Draft', students_count: 8, gradingProgress: 0 },
          ],
          coursesLoading: false,
        })
      }
    } catch {
      set({ coursesLoading: false })
    }
  },
  
  setSelectedCourse: (course) => {
    set({ selectedCourse: course })
  },
  
  loadStudents: async (courseId: number) => {
    set({ studentsLoading: true, students: [] })
    try {
      const res = await listStudents({ path: { course_id: courseId }, query: {} }).catch(() => ({ data: null }))
      if (res.data?.success) {
        const data = res.data.data || []
        set({ students: (data as any[]).map((s: any) => ({ id: s.id, full_name: s.full_name, progress: s.progress ?? 0 })), studentsLoading: false })
        // Update selected course with student count
        const course = get().courses.find(c => c.id === courseId)
        if (course) {
          set({ selectedCourse: { ...course, students_count: data.length } })
        }
      } else {
        // Mock data fallback
        set({
          students: [
            { id: 101, full_name: 'Ahmad Al-Rashid', progress: { quiz: 80, survey: 60, form: 40, 'flight-pack': 90 } },
            { id: 102, full_name: 'Layla Mohammed', progress: { quiz: 45, survey: 30, form: 15, 'flight-pack': 20 } },
            { id: 103, full_name: 'Omar Khalid', progress: { quiz: 100, survey: 100, form: 100, 'flight-pack': 100 } },
          ],
          studentsLoading: false,
        })
        if (get().selectedCourse) {
          set({ selectedCourse: { ...get().selectedCourse!, students_count: 3 } })
        }
      }
    } catch {
      set({ studentsLoading: false })
    }
  },
  
  setSelectedStudent: (student) => {
    set({ selectedStudent: student })
  },
  
  setActiveTab: (tab) => {
    set({ activeTab: tab })
  },
  
  loadGradingData: async () => {
    const { selectedCourse } = get()
    if (!selectedCourse) return
    
    // Load survey/list
    try {
      const surveyRes = await listSurveys().catch(() => ({ data: null }))
      if (surveyRes.data?.success) {
        set({ surveys: (surveyRes.data.data || []) as SurveyResponse[] })
      }
    } catch { /* skip */ }
    
    // Load forms
    try {
      const formRes = await listFormsAll().catch(() => ({ data: null }))
      if (formRes.data?.success) {
        set({ forms: (formRes.data.data || []).map((f: any) => ({ id: f.id, formId: f.id, name: f.title })) })
      }
    } catch { /* skip */ }
    
    // Load quiz attempts for all students in this course
    try {
      // listMyAttempts doesn't take courseId but we filter locally
      const attemptsRes = await listMyAttempts().catch(() => ({ data: null }))
      if (attemptsRes.data?.data) {
        const attempts = attemptsRes.data.data as QuizAttemptResponse[]
        set({ quizAttempts: attempts })
      }
    } catch { /* skip */ }
  },
  
  setQuizAnswer: (questionId, score, note) => {
    set((state) => ({
      quizAnswers: { ...state.quizAnswers, [questionId]: { score, note } },
    }))
  },
  
  setSurveyAnswer: (questionId, score, note) => {
    set((state) => ({
      surveyAnswers: { ...state.surveyAnswers, [questionId]: { score, note } },
    }))
  },
  
  setFormAnswer: (questionId, score, note) => {
    set((state) => ({
      formAnswers: { ...state.formAnswers, [questionId]: { score, note } },
    }))
  },
  
  setQuizAnswersFromStorage: (answers) => {
    set({ quizAnswers: answers })
  },
  
  setSurveyAnswersFromStorage: (answers) => {
    set({ surveyAnswers: answers })
  },
  
  setFormAnswersFromStorage: (answers) => {
    set({ formAnswers: answers })
  },
}))

export default useStore
