import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Form, FormQuestion, FormPermission, StudentResponse, FormQuestionType, FormAnswerOption, FormStatus, FormAssignmentType, CourseOption, FormTaker } from '../types/form';
import { client } from '../../../../api/client';


import {
    createFormApiV1FormFormsPost as apiCreateForm,
    listFormsApiV1FormFormsGet as apiListForms,
    updateFormApiV1FormFormsFormIdPut as apiUpdateForm,
    removeFormApiV1FormFormsFormIdDelete as apiRemoveForm,
    createQuestionApiV1FormFormsFormIdQuestionsPost as apiAddQuestionToForm,
    updateQuestionApiV1FormFormsFormIdQuestionsQuestionIdPut as apiUpdateQuestionInForm,
    deleteQuestionApiV1FormFormsFormIdQuestionsQuestionIdDelete as apiDeleteQuestionFromForm,
    getFormApiV1FormFormsFormIdGet as apiGetForm,
    listPoolQuestionsApiV1FormPoolQuestionPoolGet as apiGetFormPoolQuestions,
    createQuestionPoolItemApiV1FormPoolQuestionPoolPost as apiCreateQuestionPoolItem,
    listCoursesApiV1CoursesGet as apiListCourses

} from '../../../../api/generated'


import type {

    CreateQuestionApiV1FormFormsFormIdQuestionsPostResponses,
    QuizResponse,
    FormQuestionResponse,
    // SuccessResponseListFormResponse,
    // AddQuestionApiV1FormFormIdQuestionsPostResponse,
    FormResponse,
    AppModulesCourseSchemasCourseResponse as CourseResponse,
    // FormAnswerOptionRead

} from '../../../../api/generated'

export type FormFormPayload = {
    title: string
    description: string
    status?: string
    scheduledAt?: string | null
    courseId?: number | null
    assignmentType?: FormAssignmentType
    assigneeId?: string | null
}


const toQuestion = (q: FormQuestionResponse): FormQuestion => ({
    id: q.id,
    text: q.text,
    type: q.type,
    allowMultiple: q.allow_multiple,
    options: q.options as FormAnswerOption[],
    weight: q.weight ?? 0,
    required: q.required,
    pool_question_id: q.pool_question_id

})

const toForm = (s: FormResponse): Form => ({
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status === 'draft' ? 'draft' : 'published',
    scheduledAt: s.scheduled_at ?? null,
    courseId: s.course_id ?? null,
    assignmentType: (s.assignment_type ?? 'general') as FormAssignmentType,
    assigneeId: s.assignee_id ?? null,
    questions: (s.questions ?? []).map(toQuestion),
})

const toCourseOption = (c: CourseResponse): CourseOption => ({
    id: c.id,
    title: c.title,
})

type FormTakerApi = { id: number; full_name: string; email: string; username: string }

const toFormTaker = (u: FormTakerApi): FormTaker => ({
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    username: u.username,
})

interface FormState {

    forms: Form[]
    selectedFormId: number | null
    loading: boolean
    loaded: boolean
    formPermissions: FormPermission
    attempts: StudentResponse[]
    questionsFromQuizPool: FormQuestion[]
    formPoolQuestions: FormQuestion[]
    courses: CourseOption[]
    eligibleTakers: FormTaker[]
    selectForm: (id: number | null) => void
    listForms: () => Promise<void>
    listAssignedForms: () => Promise<void>
    getRecipients: (formId: number) => Promise<{ studentIds: number[]; completedStudentIds: number[] }>
    setRecipients: (formId: number, studentIds: number[]) => Promise<{ studentIds: number[]; completedStudentIds: number[] }>
    addForm: (q: FormFormPayload) => Promise<void>
    updateForm: (
        id: number,
        q: FormFormPayload,
    ) => Promise<void>
    updatePermission: (formPermissions: FormPermission) => void
    fetchFormPool: () => Promise<void>
    fetchCourses: () => Promise<void>
    fetchEligibleTakers: () => Promise<void>
    fetchAttempts: () => Promise<void>
    removeForm: (formId: number) => Promise<void>
    addQuestion: (
        formId: number,
        question: Omit<FormQuestion, 'id'>,
    ) => Promise<void>
    updateQuestion: (
        formId: number,
        questionId: number,
        question: Omit<FormQuestion, 'id'>,
    ) => Promise<void>
    removeQuestion: (formId: number, questionId: number) => Promise<void>
    createQuestionPoolItem: (q: FormQuestion) => Promise<void>

}


export const unwrap = <T,>(res: { data?: unknown; error?: unknown }): T => {
    if (res.error) throw new Error('API request failed')
    const body = res.data as { success?: boolean; data?: T } | undefined
    if (!body || body.success === false) throw new Error('API returned an error')
    return body.data as T
}

export const useFormStore = create<FormState>()(
    //persist
    ((set, get) => ({
        forms: [],
        questionsFromQuizPool: [],
        formPoolQuestions: [],
        courses: [],
        eligibleTakers: [],
        selectedFormId: null,
        loading: false,
        loaded: false,
        formPermissions: {
            hasFormManage: false,
            hasFormTake: false,
            hasFormView: true
        },
        attempts: [],
        addForm: async (payload) => {

            const formCreated = unwrap<FormResponse>(
                await apiCreateForm({
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

            const form = toForm(formCreated);

            set((state) => ({
                forms: [...state.forms, form]
            }))


        },
        listForms: async () => {
            const formsFromApi = unwrap<FormResponse[]>(await apiListForms())
            const forms = formsFromApi.map(toForm);

            const selected = get().selectedFormId

            set({
                forms,
                loaded: true,
                selectedFormId:
                    selected && forms.some(s => s.id === selected) ? selected : forms[0]?.id ?? null
            })
        },
        // A student's own list: only forms sent to them and not yet finished.
        listAssignedForms: async () => {
            const formsFromApi = unwrap<FormResponse[]>(
                await client.get({ url: '/api/v1/form/forms/assigned' })
            )
            const forms = formsFromApi.map(toForm);
            const selected = get().selectedFormId
            set({
                forms,
                loaded: true,
                selectedFormId:
                    selected && forms.some(s => s.id === selected) ? selected : forms[0]?.id ?? null
            })
        },
        getRecipients: async (formId) => {
            const r = unwrap<{ student_ids: number[]; completed_student_ids: number[] }>(
                await client.get({ url: `/api/v1/form/forms/${formId}/recipients` })
            )
            return { studentIds: r.student_ids, completedStudentIds: r.completed_student_ids }
        },
        setRecipients: async (formId, studentIds) => {
            const r = unwrap<{ student_ids: number[]; completed_student_ids: number[] }>(
                await client.put({
                    url: `/api/v1/form/forms/${formId}/recipients`,
                    body: { student_ids: studentIds },
                })
            )
            return { studentIds: r.student_ids, completedStudentIds: r.completed_student_ids }
        },
        updateForm: async (id, updates) => {
            const formUpdated = unwrap<FormResponse>(
                await apiUpdateForm({
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
                        form_id: id
                    }
                })
            )
            const form = toForm(formUpdated);
            set(state => ({
                forms: state.forms.map(s => s.id === id ? { ...form } : s)
            }))
        },
        removeForm: async (formId) => {

            await apiRemoveForm({
                path: {
                    form_id: formId
                }
            })

            set((state) => {
                const remaining = state.forms.filter(q => q.id !== formId)
                return {
                    forms: remaining,
                    selectedFormId:
                        state.selectedFormId === formId ? remaining[0]?.id ?? null
                            : state.selectedFormId
                }
            })


            set((state) => ({
                forms: state.forms.filter(s => s.id !== formId)
            }))
        },
        fetchFormPool: async () => {
          //  console.log('get().formPermissions.hasFormManage',get().formPermissions.hasFormManage)
            if (get().formPermissions.hasFormManage) {
                set({ loading: true })
                try {
                    const poolQuestions = unwrap<FormQuestion[]>(await apiGetFormPoolQuestions({}))

                    set({
                        formPoolQuestions: poolQuestions
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
                const takers = unwrap<FormTakerApi[]>(
                    await client.get({ url: '/api/v1/form/eligible-takers' })
                )
                set({ eligibleTakers: takers.map(toFormTaker) })
            } catch (err) {
                console.log('Error fetching eligible takers', err)
            }
        },

        updatePermission: (formPermissions: FormPermission) => {
            set({ formPermissions })
        },
        selectForm: (id) => {
            set({ selectedFormId: id })
        },
        fetchAttempts: async () => {

        },

        addQuestion: async (formId, q) => {

            const questionCreated = unwrap<FormQuestion>(
                await apiAddQuestionToForm({
                    path: {
                        form_id: formId
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
                forms: state.forms.map((s) => (
                    s.id === formId ? { ...s, questions: [...s.questions, { ...questionCreated, id: s.questions.length === 0 ? 1 : s.questions.length + 1 }] } : s
                ))
            }))
        },
        updateQuestion: async (formId, questionId, qUpdates) => {
            const questionUpdated = unwrap<FormQuestion>(
                await apiUpdateQuestionInForm({
                    path: {
                        form_id: formId,
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
                forms: state.forms.map((s) => s.id === formId
                    ?
                    {
                        ...s,
                        questions: s.questions.map((q) => (q.id === questionId ? { ...q, ...questionUpdated } : q)),
                    } : s
                ),
            }))
        },
        removeQuestion: async (formId, questionId) => {

            await apiDeleteQuestionFromForm({
                path: {
                    form_id: formId,
                    question_id: questionId
                }
            }).then((value) => {
                if (value.response.status === 200) {
                    set((state) => ({
                        forms: state.forms.map((s) => s.id === formId ? {
                            ...s,
                            questions: s.questions.filter((q) => q.id !== questionId)
                        } : s),
                    }))
                }
            }).catch(err => {
                console.log('Error deleting the question from form', err)
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
        //     { name: 'form-localstorage' }
    )
)
