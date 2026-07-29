import { create } from 'zustand'
import type {
  FormBuilderForm,
  FormBuilderLesson,
  FormBuilderSurvey,
  FormOption,
  SurveyOption,
} from './course-selection-form-api'

// `currentLessonId` is null when the selected target is the course itself.
interface FormBuilderState {
  formBuilderId: number | null
  status: 'incomplete' | 'complete'
  courseMasterCompletion: number
  courseTitle: string
  // True when the whole-course (non-lesson) survey/form links differ from the master.
  courseModified: boolean
  lessons: FormBuilderLesson[]
  currentLessonId: number | null
  associatedSurveys: FormBuilderSurvey[]
  availableSurveys: SurveyOption[]
  associatedForms: FormBuilderForm[]
  availableForms: FormOption[]
  loading: boolean

  setFormBuilder: (
    id: number,
    status: 'incomplete' | 'complete',
    completion: number,
    courseTitle: string,
    courseModified?: boolean,
  ) => void
  setStatus: (status: 'incomplete' | 'complete', completion: number) => void
  setLessons: (lessons: FormBuilderLesson[]) => void
  setCurrentLessonId: (id: number | null) => void
  setAssociatedSurveys: (surveys: FormBuilderSurvey[]) => void
  setAvailableSurveys: (surveys: SurveyOption[]) => void
  addAssociation: (survey: FormBuilderSurvey) => void
  removeAssociation: (linkId: number) => void
  setAssociatedForms: (forms: FormBuilderForm[]) => void
  setAvailableForms: (forms: FormOption[]) => void
  addFormAssociation: (form: FormBuilderForm) => void
  removeFormAssociation: (linkId: number) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

const INITIAL: Omit<FormBuilderState,
  | 'setFormBuilder' | 'setStatus' | 'setLessons' | 'setCurrentLessonId'
  | 'setAssociatedSurveys' | 'setAvailableSurveys' | 'addAssociation'
  | 'removeAssociation' | 'setAssociatedForms' | 'setAvailableForms'
  | 'addFormAssociation' | 'removeFormAssociation' | 'setLoading' | 'reset'
> = {
  formBuilderId: null,
  status: 'incomplete',
  courseMasterCompletion: 0,
  courseTitle: '',
  courseModified: false,
  lessons: [],
  currentLessonId: null,
  associatedSurveys: [],
  availableSurveys: [],
  associatedForms: [],
  availableForms: [],
  loading: false,
}

export const useCourseSelectionFormStore = create<FormBuilderState>((set) => ({
  ...INITIAL,

  setFormBuilder: (formBuilderId, status, courseMasterCompletion, courseTitle, courseModified = false) =>
    set({ formBuilderId, status, courseMasterCompletion, courseTitle, courseModified }),
  setStatus: (status, courseMasterCompletion) => set({ status, courseMasterCompletion }),
  setLessons: (lessons) => set({ lessons }),
  setCurrentLessonId: (currentLessonId) => set({ currentLessonId }),
  setAssociatedSurveys: (associatedSurveys) => set({ associatedSurveys }),
  setAvailableSurveys: (availableSurveys) => set({ availableSurveys }),
  addAssociation: (survey) =>
    set((s) => ({ associatedSurveys: [...s.associatedSurveys, survey] })),
  removeAssociation: (linkId) =>
    set((s) => ({
      associatedSurveys: s.associatedSurveys.filter((q) => q.id !== linkId),
    })),
  setAssociatedForms: (associatedForms) => set({ associatedForms }),
  setAvailableForms: (availableForms) => set({ availableForms }),
  addFormAssociation: (form) =>
    set((s) => ({ associatedForms: [...s.associatedForms, form] })),
  removeFormAssociation: (linkId) =>
    set((s) => ({
      associatedForms: s.associatedForms.filter((q) => q.id !== linkId),
    })),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ ...INITIAL }),
}))
