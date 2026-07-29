import { useEffect, useState } from "react";
import {
    FaTimes,
    FaArrowLeft,
    FaArrowRight,
    FaCheck,
    FaClipboardList,
    FaEye
} from 'react-icons/fa'

import { useStudentStore } from "../stores/studentStore";
import { useSurveyStore } from "../stores/surveyStore";
import { StudentResponse } from "../types/survey";
import useToastStore from "../../../../infra/shared/store/useToastStore";


interface Props {
    isOpen: boolean;
    onClose: () => void
    surveyId: string;
    studentId: string;
    mode?: 'take' | 'review'
}

export default function SurveyTake({ isOpen, onClose, surveyId, studentId, mode = 'take' }: Props) {
    const { surveys } = useSurveyStore()

    const { startResponse, getResponseBySurveyAndStudent, saveProgress, finishResponse } = useStudentStore();

    const survey= surveys.find(s=>s.id===surveyId)
    const [response,setResponse]=useState<StudentResponse|null>(null)
    const [currentIndex,setCurrentIndex]=useState(0)
    const [answers,setAnswers]=useState<Record<string,any>>({})
    const [isSubmitting,setIsSubmitting]=useState(false)


    // Initialize or resume response
    useEffect(()=>{
        if(!isOpen || !survey) return
        let resp= getResponseBySurveyAndStudent(surveyId,studentId)
        if(!resp && mode === 'take'){
            resp= startResponse(surveyId,studentId)
        } 
        if(resp){
            setResponse(resp)
            setAnswers(resp.answers || {})
            setCurrentIndex(resp.currentIndex?? 0)
        }
    },[isOpen,survey,surveyId,studentId,mode])

    // Auto-save progress on answer change
    useEffect(()=>{
        if(response && mode ==='take'){
            saveProgress(response.id,answers,currentIndex)
        }
    },[answers,currentIndex,response,mode])

    if(!isOpen || !survey) return null

    // Safety check if there is no questions in the survey
    if(!survey.questions || survey.questions.length ===0 ){
        return(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white p-8 rounded-2xl">
                    <p className="text-slate-700">No questions available in this survey.</p>
                    <button onClick={onClose} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl">
                        Close
                    </button>
                </div>
            </div>
        )
    }

    const totalQuestions = survey.questions.length
    const currentQuestion = survey.questions[currentIndex]
    const isFirstQuestion = currentIndex===0
    const isLastQuestion =currentIndex === totalQuestions -1
    const isReviewMode=mode==='review' || response?.isFinished

    // Set answer for current question
    const handleAnswer = (questionId:string,value:any)=>{
        if(isReviewMode) return
        setAnswers(prev=>({...prev,[questionId]:value}))
    }

    // Navigation
    const handlePrevious=()=>{
        if(currentIndex>0){
            setCurrentIndex(currentIndex - 1)
        }
    }

    const handleNext=()=>{
        if(currentIndex<totalQuestions -1){
            setCurrentIndex(currentIndex + 1)
        }
    }

    const handleFinish=()=>{
        if(!response)return
        setIsSubmitting(true)
        
        // Validate required questions (optional)
        const unanswered = survey.questions.filter(q=>q?.required && !answers[q.id]).map(q=>q.text)

        if(unanswered.length >0 ){
            useToastStore.getState().push({ variant: 'warning', title: 'Please answer required questions', body: unanswered.join('\n') })
            setIsSubmitting(false)
            return
        }

        // Mark as finished
        finishResponse(response.id)

        setTimeout(()=>{
            setIsSubmitting(false)
            useToastStore.getState().push({ variant: 'success', title: 'Survey completed. Thank you for your response.' })
            onClose()
        },500)
    }

    return(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="flex-shrink-0 p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                {isReviewMode? (
                                    <FaEye className="w-6 h-6 text-indigo-600"/>
                                ):(
                                    <FaClipboardList className="w-6 h-6 text-blue-600"/>
                                )}
                                <h2 className="text-2xl font-bold text-slate-900">
                                    {survey.title}
                                </h2>
                            </div>
                            <p className="text-slate-600">{survey.description}</p>
                            {isReviewMode && (
                                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                                    <FaCheck className="w-4 h-4"/>
                                    Completed
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="flex-shrink-0 p-2 hover:bg-white/50 rounded-xl transition-colors"
                        >
                            <FaTimes className="w-6 h-6 text-slate-600"/>
                        </button>
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="flex-shrink-0 px-6 py-4 bg-slate-50 border-b">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">
                            Question {currentIndex + 1 } of {totalQuestions}
                        </span>
                        <span className="text-sm text-slate-500">
                            {Math.round(((currentIndex + 1)/totalQuestions)*100)}% Complete
                        </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow:hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                            style={{width:`${((currentIndex+1)/totalQuestions)*100}%`}}
                        />
                    </div>
                </div>

                {/* Question Content */}
                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="max-w-2xl mx-auto">
                        {/* Question Text */}
                        <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-start gap-3">
                            <span className="flex-shrink-0 w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                                {currentIndex + 1}
                            </span>
                            <span className="flex-1">
                                {currentQuestion.text}
                                {currentQuestion.required && (
                                    <span className="ml-2 text-red-500">*</span>
                                )}
                            </span>
                        </h3>

                        {/* Answer Input based on question type */}
                        <div className="space-y-3">
                            {/* Free Text */}
                            {currentQuestion.type==='text' && (
                                <textarea
                                    value={answers[currentQuestion.id] || ''}
                                    onChange={e=>handleAnswer(currentQuestion.id,e.target.value)}
                                    disabled={isReviewMode}
                                    className="w-full p-4 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 resize-vertical min-h-[120px] disabled:bg-slate-50 disabled:text-slate-600"
                                    placeholder={isReviewMode ? 'No answer provided':'Type your answer here...'}
                                />
                            )}

                            {/* Multipl Choice */}
                            {currentQuestion.type === 'multiple' && (
                                <div className="space-y-3">
                                    {currentQuestion.options?.map(option=>(
                                        <label
                                            key={option.id}
                                            className={`group flex items-center gap-4 p-5 border-2 rounded-2xl cursor-pointer transition-all ${
                                                answers[currentQuestion.id]===option.id
                                                ? 'border-blue-500 bg-blue-50 shadow-md'
                                                :'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                                            }${isReviewMode?'cursor-default':''}`}
                                        >
                                            <input
                                                type="radio"
                                                name={currentQuestion.id}
                                                value={option.id}
                                                checked={answers[currentQuestion.id]===option.id}
                                                onChange={()=>handleAnswer(currentQuestion.id,option.id)}
                                                disabled={isReviewMode}
                                                className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-lg font-medium text-slate-800">
                                                {option.text}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {/* Rating scale */}
                            {currentQuestion.type === 'rating' && (
                                <div className="flex flex-wrap gap-3">
                                    {currentQuestion.options?.map(option=>(
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={()=>handleAnswer(currentQuestion.id,option.id)}
                                            disabled={isReviewMode}
                                            className={`px-6 py-4 rounded-2xl font-semibold text-lg transition-all ${
                                                answers[currentQuestion.id]===option.id
                                                ?'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg scale-10'
                                                :'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-105'
                                            }${isReviewMode ? 'cursor-default':''}`}
                                        >
                                            {option.text}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Navigation */}
                {!isReviewMode && (
                    <div className="flex-shrink-0 p-6 border-t bg-slate-50 flex items-center justify-between gap-4">
                        <button
                            onClick={handlePrevious}
                            disabled={isFirstQuestion}
                            className={`px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all ${
                                isFirstQuestion
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                            }`}
                        >
                            <FaArrowLeft className="w-4 h-4"/>
                            Previous
                        </button>
                        <span className="text-sm text-slate-500 font-medium">
                            {currentIndex + 1} / {totalQuestions}
                        </span>
                        {isLastQuestion ? (
                            <button
                             onClick={handleFinish}
                             disabled={isSubmitting}
                             className={`px-8 py-3 rounded-xl font-bold text-lg flex item-center gap-3 transition-all shadow-lg ${
                                isSubmitting
                                ?'bg-gray-400 cursor-not-allowed'
                                :'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 hover:scale-105'
                             }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                                        Submitting...
                                    </>
                                ):(
                                    <>
                                    <FaCheck className="w-5 h-5"/>
                                    Finish Survey
                                    </>
                                )}
                            </button>
                        ):(
                            <button
                                onClick={handleNext}
                                className="px-6 py-3 rounded-xl font-semibold bg-gradient-to-r form-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
                            >
                                Next
                                <FaArrowRight className="w-4 h-4"/>
                            </button>
                        )}
                    </div>
                )}

                {/* Review Mode Footer */}
                {isReviewMode && (
                    <div className="flex-shrink-0 p-6 border-t bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-green-600 font-semibold">
                            <FaCheck className="w-5 h-5"/>
                            Survey Completed
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handlePrevious}
                                disabled={isFirstQuestion}
                                className={`px-4 py-2 rounded-xl ${
                                    isFirstQuestion ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                <FaArrowLeft className="w-4 h-4"/>
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={isLastQuestion}
                                className={`px-4 py-2 rounded-xl ${
                                    isLastQuestion? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                <FaArrowRight className="w-4 h-4"/>
                            </button>
                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )

}