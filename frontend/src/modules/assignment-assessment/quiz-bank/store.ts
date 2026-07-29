import { create } from 'zustand'
import { client } from '../../../api/client'
import {
  listQuizzesApiV1QuizBankQuizzesGet as apiListQuizzes,
  createQuizApiV1QuizBankQuizzesPost as apiCreateQuiz,
  updateQuizApiV1QuizBankQuizzesQuizIdPut as apiUpdateQuiz,
  deleteQuizApiV1QuizBankQuizzesQuizIdDelete as apiDeleteQuiz,
  setQuizStatusApiV1QuizBankQuizzesQuizIdStatusPatch as apiSetQuizStatus,
  createQuestionApiV1QuizBankQuizzesQuizIdQuestionsPost as apiCreateQuestion,
  updateQuestionApiV1QuizBankQuizzesQuizIdQuestionsQuestionIdPut as apiUpdateQuestion,
  deleteQuestionApiV1QuizBankQuizzesQuizIdQuestionsQuestionIdDelete as apiDeleteQuestion,
  submitAttemptApiV1QuizBankQuizzesQuizIdAttemptsPost as apiSubmitAttempt,
  listMyAttemptsApiV1QuizBankAttemptsGet as apiListMyAttempts,
} from '../../../api/generated'
import type {
  QuizResponse,
  QuizQuestionResponse,
  QuizAttemptResponse,
  AttemptAnswer,
} from '../../../api/generated'

export type QuizType = 'multiple_choice' | 'essay' | 'mixed' | 'true_false'
export type QuestionType = 'multiple_choice' | 'essay' | 'true_false'
export type ValidationStatus = 'pending' | 'approved' | 'rejected'
export type Difficulty = 'easy' | 'medium' | 'difficult'

export interface QuizQuestion {
  id: number
  description: string
  type: QuestionType
  difficulty: Difficulty
  weight: number
  choices?: string[]
  answers: string[]
  existingQuizId?: number
}

export interface AttemptResult {
  question_id: number
  correct: boolean
  awarded: number
  weight: number
  needs_review: boolean
  answer: string[]
  text: string | null
}

export interface QuizAttempt {
  id: number
  quiz_id: number
  quiz_name: string
  student_id: number
  score: number
  max_score: number
  has_essay: boolean
  submitted_at: string
  results: AttemptResult[]
}

export interface Quiz {
  id: number
  name: string
  type?: QuizType|undefined
  description: string
  weight: number
  status: ValidationStatus
  questions: QuizQuestion[]
}

export interface QuizPermission {
  hasQuizView: boolean
  hasQuizManage: boolean
  hasQuizApprove: boolean
  hasQuizReject: boolean
  hasQuizTake: boolean
  hasQuestionView: boolean
  hasQuestionManage: boolean
}

export interface QuizTaker {
  id: number
  fullName: string | null
  email: string | null
  username: string | null
}

export interface QuizRecipients {
  studentIds: number[]
  completedStudentIds: number[]
}

const toQuestion = (q: QuizQuestionResponse): QuizQuestion => ({
  id: q.id,
  description: q.description,
  type: q.type,
  difficulty: q.difficulty,
  weight: q.weight,
  choices: q.choices ?? undefined,
  answers: q.answers,
})

const toAttempt = (a: QuizAttemptResponse): QuizAttempt => ({
  id: a.id,
  quiz_id: a.quiz_id,
  quiz_name: a.quiz_name,
  student_id: a.student_id,
  score: a.score,
  max_score: a.max_score,
  has_essay: a.has_essay,
  submitted_at: a.submitted_at,
  results: (a.results ?? []).map((r) => ({
    question_id: r.question_id,
    correct: r.correct,
    awarded: r.awarded,
    weight: r.weight,
    needs_review: r.needs_review ?? false,
    answer: r.answer ?? [],
    text: r.text ?? null,
  })),
})

const toQuiz = (q: QuizResponse): Quiz => ({
  id: q.id,
  name: q.name,
  type: q.type ?? undefined,
  description: q.description ?? '',
  weight: q.weight,
  status: q.status,
  questions: (q.questions ?? []).map(toQuestion),
})

const unwrap = <T,>(res: { data?: unknown; error?: unknown }): T => {
  if (res.error) throw new Error('API request failed')
  const body = res.data as { success?: boolean; data?: T } | undefined
  if (!body || body.success === false) throw new Error('API returned an error')
  return body.data as T
}

interface QuizBankState {
  quizzes: Quiz[]
  selectedQuizId: number | null
  loading: boolean
  loaded: boolean
  attempts: QuizAttempt[]
  attemptsLoaded: boolean
  quizPermissions: QuizPermission
  eligibleTakers: QuizTaker[]
  fetchQuizzes: () => Promise<void>
  fetchAssignedQuizzes: () => Promise<void>
  fetchEligibleTakers: () => Promise<void>
  getRecipients: (quizId: number) => Promise<QuizRecipients>
  setRecipients: (quizId: number, studentIds: number[]) => Promise<QuizRecipients>
  fetchAttempts: () => Promise<void>
  selectQuiz: (id: number | null) => void
  addQuiz: (q: Omit<Quiz, 'id' | 'questions' | 'status'>) => Promise<void>
  updateQuiz: (
    id: number,
    q: Omit<Quiz, 'id' | 'questions' | 'status'>,
  ) => Promise<void>
  removeQuiz: (id: number) => Promise<void>
  setQuizStatus: (id: number, status: ValidationStatus) => Promise<void>
  addQuestion: (
    quizId: number,
    question: Omit<QuizQuestion, 'id'>,
  ) => Promise<void>
  updateQuestion: (
    quizId: number,
    questionId: number,
    question: Omit<QuizQuestion, 'id'>,
  ) => Promise<void>
  removeQuestion: (quizId: number, questionId: number) => Promise<void>
  submitAttempt: (
    quizId: number,
    answers: AttemptAnswer[],
  ) => Promise<QuizAttempt>,
  updatePermission: (quizPermissions:QuizPermission) => void
}

const replaceQuiz = (quizzes: Quiz[], updated: Quiz): Quiz[] =>
  quizzes.map((q) => (q.id === updated.id ? updated : q))

const upsertQuestion = (
  quizzes: Quiz[],
  quizId: number,
  question: QuizQuestion,
): Quiz[] =>
  quizzes.map((q) => {
    if (q.id !== quizId) return q
    const exists = q.questions.some((x) => x.id === question.id)
    return {
      ...q,
      questions: exists
        ? q.questions.map((x) => (x.id === question.id ? question : x))
        : [...q.questions, question],
    }
  })

const useQuizBankStore = create<QuizBankState>((set, get) => ({
  quizzes: [],
  selectedQuizId: null,
  loading: false,
  loaded: false,
  attempts: [],
  attemptsLoaded: false,
  eligibleTakers: [],
  quizPermissions: {
    hasQuizView: false,
    hasQuizManage: false,
    hasQuizApprove: false,
    hasQuizReject: false,
    hasQuizTake: false,
    hasQuestionView: false,
    hasQuestionManage: false,
  },

  fetchQuizzes: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const list = unwrap<QuizResponse[]>(await apiListQuizzes({}))
      const quizzes = list.map(toQuiz)
      const selected = get().selectedQuizId
      set({
        quizzes,
        loaded: true,
        selectedQuizId:
          selected && quizzes.some((q) => q.id === selected)
            ? selected
            : quizzes[0]?.id ?? null,
      })
    } finally {
      set({ loading: false })
    }
  },

  // A student's own list: only quizzes sent to them and not yet taken.
  fetchAssignedQuizzes: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const list = unwrap<QuizResponse[]>(
        await client.get({ url: '/api/v1/quiz-bank/quizzes/assigned' }),
      )
      const quizzes = list.map(toQuiz)
      const selected = get().selectedQuizId
      set({
        quizzes,
        loaded: true,
        selectedQuizId:
          selected && quizzes.some((q) => q.id === selected)
            ? selected
            : quizzes[0]?.id ?? null,
      })
    } finally {
      set({ loading: false })
    }
  },

  fetchEligibleTakers: async () => {
    try {
      const takers = unwrap<
        { id: number; full_name: string | null; email: string | null; username: string | null }[]
      >(await client.get({ url: '/api/v1/quiz-bank/eligible-takers' }))
      set({
        eligibleTakers: takers.map((u) => ({
          id: u.id,
          fullName: u.full_name,
          email: u.email,
          username: u.username,
        })),
      })
    } catch (err) {
      console.log('Error fetching eligible takers', err)
    }
  },

  getRecipients: async (quizId) => {
    const r = unwrap<{ student_ids: number[]; completed_student_ids: number[] }>(
      await client.get({ url: `/api/v1/quiz-bank/quizzes/${quizId}/recipients` }),
    )
    return { studentIds: r.student_ids, completedStudentIds: r.completed_student_ids }
  },

  setRecipients: async (quizId, studentIds) => {
    const r = unwrap<{ student_ids: number[]; completed_student_ids: number[] }>(
      await client.put({
        url: `/api/v1/quiz-bank/quizzes/${quizId}/recipients`,
        body: { student_ids: studentIds },
      }),
    )
    return { studentIds: r.student_ids, completedStudentIds: r.completed_student_ids }
  },

  fetchAttempts: async () => {
    const list = unwrap<QuizAttemptResponse[]>(await apiListMyAttempts({}))
    set({ attempts: list.map(toAttempt), attemptsLoaded: true })
  },

  submitAttempt: async (quizId, answers) => {
    const created = unwrap<QuizAttemptResponse>(
      await apiSubmitAttempt({
        path: { quiz_id: quizId },
        body: { answers },
      }),
    )
    const attempt = toAttempt(created)
    set((state) => ({ attempts: [attempt, ...state.attempts] }))
    return attempt
  },

  selectQuiz: (id) => set({ selectedQuizId: id }),

  addQuiz: async (payload) => {
    const created = unwrap<QuizResponse>(
      await apiCreateQuiz({
        body: {
          name: payload.name,
          type: payload.type,
          description: payload.description,
          weight: payload.weight,
        },
      }),
    )
    const quiz = toQuiz(created)
    set((state) => ({
      quizzes: [...state.quizzes, quiz],
      selectedQuizId: quiz.id,
    }))
  },

  updateQuiz: async (id, payload) => {
    const updated = unwrap<QuizResponse>(
      await apiUpdateQuiz({
        path: { quiz_id: id },
        body: {
          name: payload.name,
          type: payload.type,
          description: payload.description,
          weight: payload.weight,
        },
      }),
    )
    set((state) => ({ quizzes: replaceQuiz(state.quizzes, toQuiz(updated)) }))
  },

  removeQuiz: async (id) => {
    await apiDeleteQuiz({ path: { quiz_id: id } })
    set((state) => {
      const remaining = state.quizzes.filter((q) => q.id !== id)
      return {
        quizzes: remaining,
        selectedQuizId:
          state.selectedQuizId === id
            ? remaining[0]?.id ?? null
            : state.selectedQuizId,
      }
    })
  },

  setQuizStatus: async (id, status) => {
    const updated = unwrap<QuizResponse>(
      await apiSetQuizStatus({ path: { quiz_id: id }, body: { status } }),
    )
    set((state) => ({ quizzes: replaceQuiz(state.quizzes, toQuiz(updated)) }))
  },

  addQuestion: async (quizId, question) => {
    const created = unwrap<QuizQuestionResponse>(
      await apiCreateQuestion({
        path: { quiz_id: quizId },
        body: {
          description: question.description,
          type: question.type,
          difficulty: question.difficulty,
          weight: question.weight,
          choices: question.choices ?? null,
          answers: question.answers,
          existing_question_id: question.existingQuizId
        },
      }),
    )
    set((state) => ({
      quizzes: upsertQuestion(state.quizzes, quizId, toQuestion(created)),
    }))
  },

  updateQuestion: async (quizId, questionId, question) => {
    const updated = unwrap<QuizQuestionResponse>(
      await apiUpdateQuestion({
        path: { quiz_id: quizId, question_id: questionId },
        body: {
          description: question.description,
          type: question.type,
          difficulty: question.difficulty,
          weight: question.weight,
          choices: question.choices ?? null,
          answers: question.answers,
        },
      }),
    )
    set((state) => ({
      quizzes: upsertQuestion(state.quizzes, quizId, toQuestion(updated)),
    }))
  },

  removeQuestion: async (quizId, questionId) => {
    await apiDeleteQuestion({
      path: { quiz_id: quizId, question_id: questionId },
    })
    set((state) => ({
      quizzes: state.quizzes.map((q) =>
        q.id === quizId
          ? { ...q, questions: q.questions.filter((x) => x.id !== questionId) }
          : q,
      ),
    }))
  },

  updatePermission: (quizPermissions:QuizPermission) => {
    set({quizPermissions})
  }
}))

export default useQuizBankStore
