import { create } from 'zustand'
import type {
  EvaluationForm,
  EvaluationLesson,
  EvaluationQuiz,
  FormOption,
  QuizOption,
} from './course-selection-evaluation-api'

// `currentLessonId` is null when the selected target is the course itself.
interface EvaluationState {
  evaluationId: number | null
  status: 'incomplete' | 'complete'
  courseMasterCompletion: number
  courseTitle: string
  // True when the whole-course (non-lesson) quiz/form associations differ from the master.
  courseModified: boolean
  lessons: EvaluationLesson[]
  currentLessonId: number | null
  associatedQuizzes: EvaluationQuiz[]
  availableQuizzes: QuizOption[]
  associatedForms: EvaluationForm[]
  availableForms: FormOption[]
  loading: boolean

  setEvaluation: (
    id: number,
    status: 'incomplete' | 'complete',
    completion: number,
    courseTitle: string,
    courseModified?: boolean,
  ) => void
  setStatus: (status: 'incomplete' | 'complete', completion: number) => void
  setLessons: (lessons: EvaluationLesson[]) => void
  setCurrentLessonId: (id: number | null) => void
  setAssociatedQuizzes: (quizzes: EvaluationQuiz[]) => void
  setAvailableQuizzes: (quizzes: QuizOption[]) => void
  addAssociation: (quiz: EvaluationQuiz) => void
  updateAssociation: (quiz: EvaluationQuiz) => void
  removeAssociation: (assocId: number) => void
  setAssociatedForms: (forms: EvaluationForm[]) => void
  setAvailableForms: (forms: FormOption[]) => void
  addFormAssociation: (form: EvaluationForm) => void
  removeFormAssociation: (linkId: number) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

const INITIAL: Omit<EvaluationState,
  | 'setEvaluation' | 'setStatus' | 'setLessons' | 'setCurrentLessonId'
  | 'setAssociatedQuizzes' | 'setAvailableQuizzes' | 'addAssociation'
  | 'updateAssociation' | 'removeAssociation' | 'setAssociatedForms'
  | 'setAvailableForms' | 'addFormAssociation' | 'removeFormAssociation'
  | 'setLoading' | 'reset'
> = {
  evaluationId: null,
  status: 'incomplete',
  courseMasterCompletion: 0,
  courseTitle: '',
  courseModified: false,
  lessons: [],
  currentLessonId: null,
  associatedQuizzes: [],
  availableQuizzes: [],
  associatedForms: [],
  availableForms: [],
  loading: false,
}

export const useCourseSelectionEvaluationStore = create<EvaluationState>((set) => ({
  ...INITIAL,

  setEvaluation: (evaluationId, status, courseMasterCompletion, courseTitle, courseModified = false) =>
    set({ evaluationId, status, courseMasterCompletion, courseTitle, courseModified }),
  setStatus: (status, courseMasterCompletion) => set({ status, courseMasterCompletion }),
  setLessons: (lessons) => set({ lessons }),
  setCurrentLessonId: (currentLessonId) => set({ currentLessonId }),
  setAssociatedQuizzes: (associatedQuizzes) => set({ associatedQuizzes }),
  setAvailableQuizzes: (availableQuizzes) => set({ availableQuizzes }),
  addAssociation: (quiz) =>
    set((s) => ({ associatedQuizzes: [...s.associatedQuizzes, quiz] })),
  updateAssociation: (quiz) =>
    set((s) => ({
      associatedQuizzes: s.associatedQuizzes.map((q) => (q.id === quiz.id ? quiz : q)),
    })),
  removeAssociation: (assocId) =>
    set((s) => ({
      associatedQuizzes: s.associatedQuizzes.filter((q) => q.id !== assocId),
    })),
  setAssociatedForms: (associatedForms) => set({ associatedForms }),
  setAvailableForms: (availableForms) => set({ availableForms }),
  addFormAssociation: (form) =>
    set((s) => ({ associatedForms: [...s.associatedForms, form] })),
  removeFormAssociation: (linkId) =>
    set((s) => ({
      associatedForms: s.associatedForms.filter((f) => f.id !== linkId),
    })),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ ...INITIAL }),
}))
