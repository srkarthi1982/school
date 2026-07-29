import { create } from 'zustand'
import { persist } from 'zustand/middleware';
import { StudentResponse, SurveyPermission } from '../types/survey';


type StudentState = {
    responses: StudentResponse[]
    surveyPermissions: SurveyPermission
    updatePermissionStudent: (surveyPermissions: SurveyPermission) => void
    //create or resume
    startResponse: (surveryId: number, studentId: string) => Promise<StudentResponse | undefined>
    saveProgress: (responseId: number, partialAnswers: Record<string, any>, currentIndex: number, questionTimes?: Record<string, number>) => void
    finishResponse: (responseId: number, overallGrade?: number, questionTimes?: Record<string, number>) => void
    getResponseBySurveyAndStudent: (surveyId: number | undefined, studentId: string) => StudentResponse | undefined
    listResponses: () => Promise<void>
}

import {

    createStudentResponseApiV1SurveySurveysStudentresponesPost as apiCreateStudentResponse,
    listStudentResponseApiV1SurveySurveysStudentresponesGet as apiListStudentResponses,
    updateStudentResponseApiV1SurveySurveysStudentresponesResponseIdPut as apiUpdateStudentResponse,
    StudentResponseResponse,

} from '../../../../api/generated'
import { unwrap } from './surveyStore';
 

const toStudentResponse = (r: StudentResponseResponse): StudentResponse => ({
    id: r.id,
    surveyId: r.survey_id,
    studentId: r.student_id,
    answers: r.answers ? r.answers : {},
    questionTimes: r.question_times ? (r.question_times as Record<string, number>) : {},
    startedAt: r.started_at,
    completedAt: r.completed_at ? r.completed_at : undefined,
    isStarted: r.is_started ? r.is_started : false,
    isFinished: r.is_finished ? r.is_finished : false,
    currentIndex: r.current_index ? r.current_index : 0,
    overallGrade: r.overall_grade ? r.overall_grade : 0

})

export const useStudentStore = create<StudentState>()(
    // persist
    ((set, get) => ({
        responses: [],
         surveyPermissions: {
            hasSurveyManage: false,
            hasSurveyTake: false,
            hasSurveyView: true
        },
        updatePermissionStudent: (surveyPermissions: SurveyPermission) => {
            set({ surveyPermissions })
        },
        listResponses: async () => {
         //   console.log('get().surveyPermissions.hasSurveyTake',get().surveyPermissions.hasSurveyTake)
            
            if(get().surveyPermissions.hasSurveyTake){
            const responsesFromApiUnWrapped = unwrap<StudentResponseResponse[]>(await apiListStudentResponses())

            const responsesFromApi = responsesFromApiUnWrapped.map(toStudentResponse);

            set(state => ({ responses: responsesFromApi }))
            }
        },
        startResponse: async (surveyId, studentId) => {
           
            // find existing in-progress
            const existing = get().responses.find(r => r.surveyId === surveyId && r.studentId === studentId && !r.isFinished)
            if (existing) return existing

            const responseUnWrapped = unwrap<StudentResponseResponse>(
                await apiCreateStudentResponse({
                    body: {
                        survey_id: surveyId,
                        student_id: studentId,
                        answers: {},
                        is_started: true,
                        is_finished: false,
                        current_index: 0,
                    }
                })
            )
            const newResp = toStudentResponse(responseUnWrapped)

            // apiCreateStudentResponse({
            //     body: {
            //         survey_id: surveyId,
            //         student_id: studentId,
            //         answers: {},
            //         is_started: true,
            //         is_finished: false,
            //         current_index: 0,
            //     }
            // })
            // const newResp: StudentResponse = {
            //     id: get().responses.length === 0 ? 1 : get().responses.length + 1,
            //     surveyId,
            //     studentId,
            //     answers: [],
            //     startedAt: new Date().toISOString(),
            //     isStarted: true,
            //     isFinished: false,
            //     currentIndex: 0
            // }
            set(state => ({ responses: [...state.responses, newResp] }))
            return newResp
        },
        saveProgress: async (responseId, partialAnswers, currentIndex, questionTimes) => {

            const currentResponse = get().responses.find(r => r.id === responseId)

            if (currentResponse) {

                const updatedResponseUnWrapped = unwrap<StudentResponseResponse>(
                    await apiUpdateStudentResponse({
                        body: {
                            ...currentResponse,
                            answers: partialAnswers,
                            question_times: questionTimes ?? currentResponse.questionTimes ?? {},
                            current_index: currentIndex,
                            is_started:true,
                        },
                        path: {
                            response_id: responseId
                        }
                    })
                )

                const updatedResponse = toStudentResponse(updatedResponseUnWrapped)

                set(state => ({
                    responses: state.responses.map(r => r.id === responseId ? { ...r, answers: { ...r.answers, ...updatedResponse.answers }, questionTimes: updatedResponse.questionTimes, currentIndex, isStarted: true } : r)
                }))
            }


        },
        finishResponse: async (responseId, overallGrade, questionTimes) => {

            const currentResponse = get().responses.find(r => r.id === responseId)

            if (currentResponse) {

                const updatedResponseUnWrapped = unwrap<StudentResponseResponse>(
                    await apiUpdateStudentResponse({
                        body: {
                            ...currentResponse,
                            overall_grade: overallGrade,
                            question_times: questionTimes ?? currentResponse.questionTimes ?? {},
                            is_started:false,
                            completed_at:new Date().toISOString(),
                            is_finished:true
                        },
                        path: {
                            response_id: responseId
                        }
                    })
                )

                const updatedResponse = toStudentResponse(updatedResponseUnWrapped)


                set(state => ({
                    // responses: state.responses.map(r => r.id === responseId ? { ...r, isStarted: false, isFinished: true, completedAt: new Date().toISOString(), overallGrade } : r),
                    responses: state.responses.map(r => r.id === responseId ? { ...r, ...updatedResponse } : r),

                }))



            }

        },
        getResponseBySurveyAndStudent: (surveyId, studentId) => {
            return get().responses.find(r => r.surveyId === surveyId && r.studentId === studentId)
        },
    })
        //  { name: 'survey-student-response' }
    )
);