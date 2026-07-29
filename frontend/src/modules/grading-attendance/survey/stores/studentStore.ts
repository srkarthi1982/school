import {create} from 'zustand'
 import { persist } from 'zustand/middleware';
import { StudentResponse } from '../types/survey';


type StudentState={
    responses:StudentResponse[]
    //create or resume
    startResponse:(surveryId:string,studentId:string)=>StudentResponse | undefined
    saveProgress:(responseId:string,partialAnswers:Record<string,any>,currentIndex:number)=>void
    finishResponse:(responseId:string)=>void
    getResponseBySurveyAndStudent:(surveyId:string,studentId:string)=>StudentResponse | undefined
}


export const useStudentStore= create<StudentState>()(
    persist((set,get)=>({
            responses:[],
            startResponse:(surveyId,studentId)=>{
                // find existing in-progress
                const existing=get().responses.find(r=>r.surveyId===surveyId && r.studentId === studentId && !r.isFinished)
                if(existing)return existing

                const newResp:StudentResponse={
                    id:Date.now().toString(),
                    surveyId,
                    studentId,
                    answers:[],
                    startedAt:new Date().toISOString(),
                    isStarted:true,
                    isFinished:false,
                    currentIndex:0
                }
                set(state=>({responses:[...state.responses,newResp]}))
                return newResp
            },
            saveProgress:(responseId,partialAnswers,currentIndex)=>{
                set(state=>({
                    responses:state.responses.map(r=>r.id===responseId ? {...r,answers:{...r.answers,...partialAnswers},currentIndex,isStarted:true}:r)
                }))
            },
            finishResponse:(responseId)=>{
                set(state=>({
                    responses:state.responses.map(r=>r.id===responseId ?{...r, isStarted:false,isFinished:true,completedAt:new Date().toISOString()}:r)
                }))
            },
            getResponseBySurveyAndStudent:(surveyId,studentId)=>{
                return get().responses.find(r=>r.surveyId===surveyId && r.studentId===studentId)
            },
        }),
        {name:'survey-student-response'}
    )
)