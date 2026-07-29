import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Survey, SurveyQuestion, SurveyPermission, StudentResponse, SurveyQuestionType, SurveyAnswerOption, SurveyStatus, SurveyAssignmentType, CourseOption, SurveyTaker } from '../types/survey';
import { client } from '../../../../api/client';


import {
    createSurveyApiV1SurveySurveysPost as apiCreateSurvey,
    listSurveysApiV1SurveySurveysGet as apiListSurveys,
    updateSurveyApiV1SurveySurveysSurveyIdPut as apiUpdateSurvey,
    removeSurveyApiV1SurveySurveysSurveyIdDelete as apiRemoveSurvey,
    createQuestionApiV1SurveySurveysSurveyIdQuestionsPost as apiAddQuestionToSurvey,
    updateQuestionApiV1SurveySurveysSurveyIdQuestionsQuestionIdPut as apiUpdateQuestionInSurvey,
    deleteQuestionApiV1SurveySurveysSurveyIdQuestionsQuestionIdDelete as apiDeleteQuestionFromSurvey,
    getSurveyApiV1SurveySurveysSurveyIdGet as apiGetSurvey,
    listPoolQuestionsApiV1SurveyPoolQuestionPoolGet as apiGetSurveyPoolQuestions,
    createQuestionPoolItemApiV1SurveyPoolQuestionPoolPost as apiCreateQuestionPoolItem,
    listCoursesApiV1CoursesGet as apiListCourses

} from '../../../../api/generated'


import type {

    CreateQuestionApiV1SurveySurveysSurveyIdQuestionsPostResponses,
    QuizResponse,
    SurveyQuestionResponse,
    // SuccessResponseListSurveyResponse,
    // AddQuestionApiV1SurveySurveyIdQuestionsPostResponse,
    SurveyResponse,
    AppModulesCourseSchemasCourseResponse as CourseResponse,
    // SurveyAnswerOptionRead

} from '../../../../api/generated'

export type SurveyFormPayload = {
    title: string
    description: string
    status?: string
    scheduledAt?: string | null
    courseId?: number | null
    assignmentType?: SurveyAssignmentType
    assigneeId?: string | null
}


const toQuestion = (q: SurveyQuestionResponse): SurveyQuestion => ({
    id: q.id,
    text: q.text,
    type: q.type,
    allowMultiple: q.allow_multiple,
    options: q.options as SurveyAnswerOption[],
    weight: q.weight ?? 0,
    required: q.required,
    pool_question_id: q.pool_question_id

})

const toSurvey = (s: SurveyResponse): Survey => ({
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status === 'draft' ? 'draft' : 'published',
    scheduledAt: s.scheduled_at ?? null,
    courseId: s.course_id ?? null,
    assignmentType: (s.assignment_type ?? 'general') as SurveyAssignmentType,
    assigneeId: s.assignee_id ?? null,
    questions: (s.questions ?? []).map(toQuestion),
})

const toCourseOption = (c: CourseResponse): CourseOption => ({
    id: c.id,
    title: c.title,
})

type SurveyTakerApi = { id: number; full_name: string; email: string; username: string }

const toSurveyTaker = (u: SurveyTakerApi): SurveyTaker => ({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    username: u.username,
})

interface SurveyState {

    surveys: Survey[]
    selectedSurveyId: number | null
    loading: boolean
    loaded: boolean
    surveyPermissions: SurveyPermission
    attempts: StudentResponse[]
    questionsFromQuizPool: SurveyQuestion[]
    surveyPoolQuestions: SurveyQuestion[]
    courses: CourseOption[]
    eligibleTakers: SurveyTaker[]
    selectSurvey: (id: number | null) => void
    listSurveys: () => Promise<void>
    listAssignedSurveys: () => Promise<void>
    getRecipients: (surveyId: number) => Promise<{ studentIds: number[]; completedStudentIds: number[] }>
    setRecipients: (surveyId: number, studentIds: number[]) => Promise<{ studentIds: number[]; completedStudentIds: number[] }>
    addSurvey: (q: SurveyFormPayload) => Promise<void>
    updateSurvey: (
        id: number,
        q: SurveyFormPayload,
    ) => Promise<void>
    updatePermission: (surveyPermissions: SurveyPermission) => void
    fetchSurveyPool: () => Promise<void>
    fetchCourses: () => Promise<void>
    fetchEligibleTakers: () => Promise<void>
    fetchAttempts: () => Promise<void>
    removeSurvey: (surveyId: number) => Promise<void>
    addQuestion: (
        surveyId: number,
        question: Omit<SurveyQuestion, 'id'>,
    ) => Promise<void>
    updateQuestion: (
        surveyId: number,
        questionId: number,
        question: Omit<SurveyQuestion, 'id'>,
    ) => Promise<void>
    removeQuestion: (surveyId: number, questionId: number) => Promise<void>
    createQuestionPoolItem: (q: SurveyQuestion) => Promise<void>

}


export const unwrap = <T,>(res: { data?: unknown; error?: unknown }): T => {
    if (res.error) throw new Error('API request failed')
    const body = res.data as { success?: boolean; data?: T } | undefined
    if (!body || body.success === false) throw new Error('API returned an error')
    return body.data as T
}

export const useSurveyStore = create<SurveyState>()(
    //persist
    ((set, get) => ({
        surveys: [],
        questionsFromQuizPool: [],
        surveyPoolQuestions: [],
        courses: [],
        eligibleTakers: [],
        selectedSurveyId: null,
        loading: false,
        loaded: false,
        surveyPermissions: {
            hasSurveyManage: false,
            hasSurveyTake: false,
            hasSurveyView: true
        },
        attempts: [],
        addSurvey: async (payload) => {

            const surveyCreated = unwrap<SurveyResponse>(
                await apiCreateSurvey({
                    body: {
                        title: payload.title,
                        description: payload.description,
                        status: payload.status ?? 'draft',
                        scheduled_at: payload.scheduledAt ?? null,
                        course_id: payload.courseId ?? null,
                        assignment_type: payload.assignmentType ?? 'general',
                        assignee_id: payload.assigneeId ?? null,
                    }
                }))

            const survey = toSurvey(surveyCreated);

            set((state) => ({
                surveys: [...state.surveys, survey]
            }))


        },
        listSurveys: async () => {
            const surveysFromApi = unwrap<SurveyResponse[]>(await apiListSurveys())
            const surveys = surveysFromApi.map(toSurvey);

            const selected = get().selectedSurveyId

            set({
                surveys,
                loaded: true,
                selectedSurveyId:
                    selected && surveys.some(s => s.id === selected) ? selected : surveys[0]?.id ?? null
            })
        },
        // A student's own list: only surveys sent to them and not yet finished.
        listAssignedSurveys: async () => {
            const surveysFromApi = unwrap<SurveyResponse[]>(
                await client.get({ url: '/api/v1/survey/surveys/assigned' })
            )
            const surveys = surveysFromApi.map(toSurvey);
            const selected = get().selectedSurveyId
            set({
                surveys,
                loaded: true,
                selectedSurveyId:
                    selected && surveys.some(s => s.id === selected) ? selected : surveys[0]?.id ?? null
            })
        },
        getRecipients: async (surveyId) => {
            const r = unwrap<{ student_ids: number[]; completed_student_ids: number[] }>(
                await client.get({ url: `/api/v1/survey/surveys/${surveyId}/recipients` })
            )
            return { studentIds: r.student_ids, completedStudentIds: r.completed_student_ids }
        },
        setRecipients: async (surveyId, studentIds) => {
            const r = unwrap<{ student_ids: number[]; completed_student_ids: number[] }>(
                await client.put({
                    url: `/api/v1/survey/surveys/${surveyId}/recipients`,
                    body: { student_ids: studentIds },
                })
            )
            return { studentIds: r.student_ids, completedStudentIds: r.completed_student_ids }
        },
        updateSurvey: async (id, updates) => {
            const surveyUpdated = unwrap<SurveyResponse>(
                await apiUpdateSurvey({
                    body: {
                        title: updates.title,
                        description: updates.description,
                        status: updates.status,
                        scheduled_at: updates.scheduledAt ?? null,
                        course_id: updates.courseId ?? null,
                        assignment_type: updates.assignmentType ?? 'general',
                        assignee_id: updates.assigneeId ?? null,
                    },
                    path: {
                        survey_id: id
                    }
                })
            )
            const survey = toSurvey(surveyUpdated);
            set(state => ({
                surveys: state.surveys.map(s => s.id === id ? { ...survey } : s)
            }))
        },
        removeSurvey: async (surveyId) => {

            await apiRemoveSurvey({
                path: {
                    survey_id: surveyId
                }
            })

            set((state) => {
                const remaining = state.surveys.filter(q => q.id !== surveyId)
                return {
                    surveys: remaining,
                    selectedSurveyId:
                        state.selectedSurveyId === surveyId ? remaining[0]?.id ?? null
                            : state.selectedSurveyId
                }
            })


            set((state) => ({
                surveys: state.surveys.filter(s => s.id !== surveyId)
            }))
        },
        fetchSurveyPool: async () => {
          //  console.log('get().surveyPermissions.hasSurveyManage',get().surveyPermissions.hasSurveyManage)
            if (get().surveyPermissions.hasSurveyManage) {
                set({ loading: true })
                try {
                    const poolQuestions = unwrap<SurveyQuestion[]>(await apiGetSurveyPoolQuestions({}))

                    set({
                        surveyPoolQuestions: poolQuestions
                    })
                } finally {
                    set({ loading: false })
                }
            }
        },

        fetchCourses: async () => {
            try {
                const courses = unwrap<CourseResponse[]>(await apiListCourses({}))
                set({ courses: courses.map(toCourseOption) })
            } catch (err) {
                console.log('Error fetching courses', err)
            }
        },

        fetchEligibleTakers: async () => {
            try {
                const takers = unwrap<SurveyTakerApi[]>(
                    await client.get({ url: '/api/v1/survey/eligible-takers' })
                )
                set({ eligibleTakers: takers.map(toSurveyTaker) })
            } catch (err) {
                console.log('Error fetching eligible takers', err)
            }
        },

        updatePermission: (surveyPermissions: SurveyPermission) => {
            set({ surveyPermissions })
        },
        selectSurvey: (id) => {
            set({ selectedSurveyId: id })
        },
        fetchAttempts: async () => {

        },

        addQuestion: async (surveyId, q) => {

            const questionCreated = unwrap<SurveyQuestion>(
                await apiAddQuestionToSurvey({
                    path: {
                        survey_id: surveyId
                    },
                    body: {
                        text: q.text,
                        type: q.type,
                        weight: q.weight,
                        required: q.required,
                        allow_multiple: q.allowMultiple,
                        options: q?.options,
                        pool_question_id: q.pool_question_id
                    }
                }))

            set((state) => ({
                surveys: state.surveys.map((s) => (
                    s.id === surveyId ? { ...s, questions: [...s.questions, { ...questionCreated, id: s.questions.length === 0 ? 1 : s.questions.length + 1 }] } : s
                ))
            }))
        },
        updateQuestion: async (surveyId, questionId, qUpdates) => {
            const questionUpdated = unwrap<SurveyQuestion>(
                await apiUpdateQuestionInSurvey({
                    path: {
                        survey_id: surveyId,
                        question_id: questionId
                    },
                    body: {
                        text: qUpdates.text,
                        type: qUpdates.type,
                        weight: qUpdates.weight,
                        required: qUpdates.required,
                        allow_multiple: qUpdates.allowMultiple,
                        options: qUpdates?.options,
                        pool_question_id: qUpdates.pool_question_id
                    }
                })
            )
            set((state) => ({
                surveys: state.surveys.map((s) => s.id === surveyId
                    ?
                    {
                        ...s,
                        questions: s.questions.map((q) => (q.id === questionId ? { ...q, ...questionUpdated } : q)),
                    } : s
                ),
            }))
        },
        removeQuestion: async (surveyId, questionId) => {

            await apiDeleteQuestionFromSurvey({
                path: {
                    survey_id: surveyId,
                    question_id: questionId
                }
            }).then((value) => {
                if (value.response.status === 200) {
                    set((state) => ({
                        surveys: state.surveys.map((s) => s.id === surveyId ? {
                            ...s,
                            questions: s.questions.filter((q) => q.id !== questionId)
                        } : s),
                    }))
                }
            }).catch(err => {
                console.log('Error deleting the question from survey', err)
            })

        },
        createQuestionPoolItem: async (q) => {
            await apiCreateQuestionPoolItem({
                body: {
                    ...q
                }
            })
        }
    })
        // ,
        //     { name: 'survey-localstorage' }
    )
)
