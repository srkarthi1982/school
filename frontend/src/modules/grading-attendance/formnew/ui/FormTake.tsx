import { useEffect, useMemo, useState } from "react";
import {
    FaTimes,
    FaArrowLeft,
    FaArrowRight,
    FaCheck,
    FaClipboardList,
    FaEye,
    FaStar
} from 'react-icons/fa'

import { useStudentStore } from "../stores/studentStore";
import { useFormStore } from "../stores/formStore";
import { StudentResponse, Form, FormQuestion } from "../types/form";

import { useShallow } from "zustand/react/shallow";

import useToastStore from "../../../../infra/shared/store/useToastStore";
import { completeLessonContentIfLinked, type LessonCtx } from "../../../dashboard-scheduling/schedule-management/lesson-detail/lessonCompletion";


interface Props {
    isOpen: boolean;
    onClose: () => void
    formId: number;
    studentId: string;
    mode?: 'take' | 'review' | 'preview'
    // Set only when the student was sent here from a lesson. Drives completion
    // marking, hides the close (X) so they must submit, and returns to the
    // lesson detail on submit.
    lessonCtx?: LessonCtx | null
    onReturnToLesson?: () => void
}

export default function FormTake({ isOpen, onClose, formId, studentId, mode = 'take', lessonCtx, onReturnToLesson }: Props) {

    const isPreview = mode === 'preview'


    //  console.log('selectedFormId from formTake',selectedFormId,forms)
    const { startResponse, getResponseByFormAndStudent, saveProgress, finishResponse } = useStudentStore();

    //  const form = forms.find(s => s.id === formId || s.id == selectedFormId)

    // console.log('form',form)
    const [form, setForm] = useState<Form | undefined>()

    const [response, setResponse] = useState<StudentResponse | null>(null)
    const [currentIndex, setCurrentIndex] = useState(0)
    const [answers, setAnswers] = useState<Record<string, any>>({})
    const [questionTimes, setQuestionTimes] = useState<Record<string, number>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    const isReviewMode = mode === 'review' || response?.isFinished
    // Launched from a lesson and still answering: the student must submit, so the
    // close (X) affordance is removed (no backdrop/Esc close exists either).
    const lockedToSubmit = !!lessonCtx && !isPreview && !isReviewMode

    const [questionStartTime, setQuestionStartTime] = useState<number | null>(null)

    //   const currentQuestion = form.questions[currentIndex]

    const [currentQuestion, setCurrentQuestion] = useState<FormQuestion>()

    useEffect(() => {
        setCurrentIndex(0)
    }, [isOpen])

    const { forms, selectedFormId } = useFormStore(
        useShallow(s => ({
            forms: s.forms,
            selectedFormId: s.selectedFormId
        }))
    )
    //   const [answeredQuestions, setAnsweredQuestions] = useState<string[]>([])

    //     useEffect(() => {
    //         const answeredQns = Object.keys(answers).filter(questionId => {
    //             const answer = answers[questionId]

    //             return answer !== null && answer !== undefined && answer !== '';

    //         })
    //         setAnsweredQuestions(answeredQns)
    //     }, [currentIndex])

    useEffect(() => {
        const currentForm = forms.find(s => s.id === formId || s.id == selectedFormId)
        setForm(currentForm)
        setCurrentQuestion(currentForm?.questions[currentIndex])

    }, [forms, selectedFormId])

    useEffect(() => {
        setCurrentQuestion(form?.questions[currentIndex])
    }, [currentIndex])


    // Initialize or resume response. Preview mode never touches the backend.
    useEffect(() => {
        if (!isOpen || !form || formId === 0 || isPreview) return

        // Apply a resolved response to local state.
        const applyResponse = (resp: StudentResponse) => {
            setResponse(resp)
            setAnswers(resp.answers || {})
            setQuestionTimes(resp.questionTimes || {})
            // Start from beginning in review mode, resume position in take mode
            const startIndex = (mode === 'review' || resp.isFinished) ? 0 : (resp.currentIndex ?? 0)
            setCurrentIndex(startIndex)
        }

        const existing = getResponseByFormAndStudent(formId, studentId)
        if (existing) {
            applyResponse(existing)
        } else if (mode === 'take') {
            // No response yet (e.g. a freshly assigned form) — create one and
            // apply it once the API call resolves, otherwise `response` stays
            // null and "Finish" can't save anything.
            startResponse(formId, studentId).then(resp => {
                if (resp) applyResponse(resp)
            })
        }
    }, [isOpen, form, formId, studentId, mode, isPreview, getResponseByFormAndStudent, startResponse])

    // Auto-save progress on answer change
    useEffect(() => {
        if (response && mode === 'take') {
            saveProgress(response.id, answers, currentIndex, questionTimes)
        }
    }, [answers, currentIndex, response, mode])

    useEffect(() => {
        setQuestionStartTime(Date.now())
    }, [currentQuestion?.id])


    if (!isOpen || !form) return null

    // Safety check if there is no questions in the form
    if (!form.questions || form.questions.length === 0) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white p-8 rounded-2xl">
                    <p className="text-slate-700">No questions available in this form.</p>
                    <button onClick={onClose} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl">
                        Close
                    </button>
                </div>
            </div>
        )
    }

    const totalQuestions = form.questions.length

    const isFirstQuestion = currentIndex === 0
    const isLastQuestion = currentIndex === totalQuestions - 1

    // const publishedForms = useMemo(

    //     () => (hasFormTake ? forms.filter((s) => s.status === 'published') : forms),
    //     [forms, hasFormTake],

    // )





    // Set answer for current question
    const handleAnswer = (questionId: number, value: any) => {

        if (isReviewMode) return
        setAnswers(prev => ({ ...prev, [questionId]: value }))
    }

    // Add the time spent on the current question to the running tally and
    // restart the per-question timer. Returns the updated map so callers can
    // persist it together with the navigation.
    const accumulateTime = (): Record<string, number> => {
        if (!currentQuestion || questionStartTime == null) return questionTimes
        const elapsed = Math.round((Date.now() - questionStartTime) / 1000)
        const key = String(currentQuestion.id)
        const updated = { ...questionTimes, [key]: (questionTimes[key] ?? 0) + elapsed }
        setQuestionTimes(updated)
        setQuestionStartTime(Date.now())
        return updated
    }

    // Navigation
    const handlePrevious = () => {
        if (currentIndex > 0) {
            const updatedTimes = accumulateTime()
            if (response && mode === 'take') saveProgress(response.id, answers, currentIndex - 1, updatedTimes)
            setCurrentIndex(currentIndex - 1)
        }
    }


    const isRequiredAnswered = () => {


        if (!currentQuestion?.required) return true
        const answer = answers[currentQuestion.id]

        // for multiple responses (checkboxes), answer is array
        if (currentQuestion && currentQuestion?.allowMultiple && Array.isArray(answer)) {
            return answer.length > 0
        }

        // for single response (radio) or text or rating any non-empty value
        return answer !== undefined && answer !== null && answer !== ''
    }
    const handleNext = () => {

        // if required and not answered, block navigation
        if (currentQuestion && currentQuestion.required && !isRequiredAnswered()) {
            useToastStore.getState().push({ variant: 'warning', title: 'Please answer this required question' })
            return
        }
        // if (!questionStartTime) return;
        // const timeSpentMs = Date.now() - questionStartTime;
        // const timeSpentSeconds = timeSpentMs / 1000;
        // if (currentQuestion) {
        //     const answerValue = answers[currentQuestion?.id]

        //     const updatedAnswer = {

        //         [currentQuestion.id]: {
        //             value: answerValue,
        //             time: timeSpentSeconds
        //         }

        //     }

        //     answers[currentQuestion.id] = updatedAnswer
        // }

        // if (currentQuestion) {
        //     const currentAnswer = answers[currentQuestion.id];
        //     if (currentAnswer !== undefined && currentAnswer !== null && currentAnswer !== '') {
        //         const updatedAnwsers = {
        //             ...answers,
        //             [currentQuestion.id]: currentAnswer
        //         }
        //         setAnswers(updatedAnwsers)
        //         if (response && mode === 'take') {
        //             saveProgress(response.id, updatedAnwsers, currentIndex + 1)
        //         }

        //     }
        // }

        if (currentIndex < totalQuestions - 1) {
            const updatedTimes = accumulateTime()
            if (response && mode === 'take') saveProgress(response.id, answers, currentIndex + 1, updatedTimes)
            setCurrentIndex(currentIndex + 1)
        }

    }

    const calculateOverAllGrade = (form: Form, answers: Record<string, any>): number => {
        let totalScore = 0
        let totalPossibleScore = 0
        form.questions.forEach(question => {
            const answer = answers[question.id]

            if (!answer) {
                // No answer , add 0 for this question
                totalPossibleScore += question.weight
                return
            }
            const selectedOption = question.options?.find(opt => opt.text === answer)
            if (selectedOption) {
                const optionWeight = selectedOption.weight ?? 1
                totalScore += question.weight * optionWeight

                const maxOptionWeight = Math.max(...(question.options?.map(o => o.weight ?? 1) || [1])
                )
                totalPossibleScore += question.weight * maxOptionWeight
            }
        })

        if (totalPossibleScore === 0) return 0
        //  return Math.round((totalScore/totalPossibleScore)*100)
        return totalPossibleScore

    }

    const handleFinish = async () => {

        // Preview mode never saves a response — just close.
        if (isPreview) {
            onClose()
            return
        }

        if (!response) return
        setIsSubmitting(true)

        // Validate required questions (optional)
        const unanswered = form.questions.filter(q => q?.required && !answers[q.id]).map(q => q.text)

        if (unanswered.length > 0) {
            useToastStore.getState().push({ variant: 'warning', title: 'Please answer required questions', body: unanswered.join('\n') })
            setIsSubmitting(false)
            return
        }

        // Calculate overall grade
        const grade = calculateOverAllGrade(form, answers);

        const updatedTimes = accumulateTime()
        await saveProgress(response.id, answers, currentIndex, updatedTimes)
        // Mark as finished — await so the list refresh on close sees it committed.
        await finishResponse(response.id, grade, updatedTimes)
        // If the student was sent here from a lesson, mark it complete for that
        // lesson (no-op otherwise) so it can't be retaken from lesson detail.
        // Use the captured ctx: the URL params were already stripped on arrival.
        void completeLessonContentIfLinked('form', formId, lessonCtx)

        setTimeout(() => {
            setIsSubmitting(false)
            useToastStore.getState().push({ variant: 'success', title: 'Form completed. Thank you for your response.' })

            // Return to the lesson detail the student came from; otherwise close.
            if (lessonCtx && onReturnToLesson) onReturnToLesson()
            else onClose()
        }, 500)
    }



    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="flex-shrink-0 p-6 border-b">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                {isReviewMode ? (
                                    <FaEye className="w-6 h-6 text-accent" />
                                ) : (
                                    <FaClipboardList className="w-6 h-6 text-accent" />
                                )}
                                <h2 className="text-2xl font-bold text-slate-900">
                                    {form.title}
                                </h2>
                            </div>
                            <p className="text-slate-600">{form.description}</p>
                            {isReviewMode && (
                                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                                    <FaCheck className="w-4 h-4" />
                                    Completed
                                </div>
                            )}
                            {isPreview && (
                                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold">
                                    <FaEye className="w-4 h-4" />
                                    Preview — responses are not saved
                                </div>
                            )}
                        </div>
                        {!lockedToSubmit && (
                            <button
                                onClick={onClose}
                                className="flex-shrink-0 p-2 hover:bg-white/50 rounded-xl transition-colors"
                            >
                                <FaTimes className="w-6 h-6 text-slate-600" />
                            </button>
                        )}
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="flex-shrink-0 px-6 py-4 bg-slate-50 border-b">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">
                            Question {currentIndex + 1} of {totalQuestions}
                        </span>
                        {!isReviewMode &&
                            <span className="text-sm text-slate-500">
                                {Math.round(((currentIndex + 1) / totalQuestions) * 100)}% Complete

                                {/* {Math.round(((answeredQuestions.length) / totalQuestions) * 100)}% Complete */}
                            </span>}
                    </div>
                    {!isReviewMode &&
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow:hidden">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                                style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
                            />
                        </div>}
                </div>

                {/* Question Content */}
                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="max-w-2xl mx-auto">
                        {/* Question Text */}
                        <span className="  text-slate-900 mb-6 flex items-start gap-3">
                            <span className="flex-shrink-0 w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center font-bold">
                                {currentIndex + 1}
                            </span>
                            <span className="flex-1">
                                {currentQuestion?.text}
                                {currentQuestion?.required && (
                                    <span className="ml-1  text-red-500 text-base">*</span>
                                )}
                            </span>
                        </span>

                        {/* Answer Input based on question type */}
                        <div className="space-y-3">
                            {/* Free Text */}
                            {currentQuestion?.type === 'text' && (
                                <textarea
                                    value={answers[currentQuestion?.id] || ''}
                                    onChange={e => handleAnswer(currentQuestion.id, e.target.value)}
                                    disabled={isReviewMode}
                                    className="w-full p-4 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 resize-vertical min-h-[120px] disabled:bg-slate-50 disabled:text-slate-600"
                                    placeholder={isReviewMode ? 'No answer provided' : 'Type your answer here...'}
                                />
                            )}

                            {/* Multipl Choice with radio buttons */}


                            {currentQuestion?.type === 'multiple' && !currentQuestion?.allowMultiple && (
                                // <div className="space-y-3">
                                //     {currentQuestion.options?.map(option => {
                                //         const isSelected = answers[currentQuestion.text] === option.text
                                //         return (
                                //             <label
                                //                 key={option.id}
                                //                 className={` flex items-center gap-4 p-2 border-2 rounded-2xl cursor-pointer transition-all ${isSelected && isReviewMode
                                //                     ? 'border-green-500 bg-green-50 shadow-md ring-2 ring-green-200'
                                //                     : isSelected
                                //                         ? 'border-blue-500 bg-blue-50 shadow-md'
                                //                         : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                                //                     }${isReviewMode ? 'cursor-default' : 'cursor-pointer'}`}
                                //                 // style={{ border: isSelected && isReviewMode ? '2px solid green' : '' }}
                                //             >
                                //                 {/* Custom Radio Cirlce */}
                                //                 <div className={`
                                //                     relative flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all ${isSelected && isReviewMode
                                //                         ? 'border-green-600 bg-white'
                                //                         : isSelected
                                //                         ? 'border-blue-600 bg-white'
                                //                         :'border-slate-400 bg-white'
                                //                     }
                                //                     `}>
                                //                     {isSelected && (
                                //                         <div className={`
                                //                             absolute top-1/2 letf-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full
                                //                             ${isReviewMode ? 'bg-green-600':'bg-blue-600'}
                                //                         `}/>

                                //                     )}
                                //                 </div>

                                //                 <input
                                //                     type="radio"
                                //                     name={currentQuestion.id.toString()}
                                //                     value={option.text}
                                //                     checked={answers[currentQuestion.id] === option.text}
                                //                     onChange={() => handleAnswer(currentQuestion.id, option.text)}
                                //                     disabled={isReviewMode}
                                //                     className={`sr-only`}
                                //                 />
                                //                 {/* Option Text */}
                                //                 <span className={`flex-1 text-sm font-medium ${isReviewMode && isSelected
                                //                     ? 'text-green-900'
                                //                     : isSelected
                                //                     ? 'text-blue-900'
                                //                     :'text-slate-800'
                                //                     }`}>
                                //                     {option.text}
                                //                 </span>
                                //                 {isReviewMode && isSelected && (
                                //                     <FaCheck className="ml-auto w-5 h-5 text-green-500" />
                                //                 )}
                                //             </label>
                                //         )
                                //     })}
                                // </div>
                                <div className="space-y-3">
                                    {currentQuestion.options?.map(option => {
                                        const isSelected = answers[currentQuestion.id] === option.id
                                        return (
                                            <label
                                                key={option.id}
                                                className={` flex items-center gap-4 p-2 border-2 rounded-2xl cursor-pointer transition-all ${isSelected && isReviewMode
                                                    ? 'border-green-500 bg-green-50 shadow-md ring-2 ring-green-200'
                                                    : isSelected
                                                        ? 'border-blue-500 bg-blue-50 shadow-md'
                                                        : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
                                                    }${isReviewMode ? 'cursor-default' : 'cursor-pointer'}`}
                                                style={{ border: isSelected && isReviewMode ? '2px solid green' : '' }}
                                            >
                                                <input
                                                    type="radio"
                                                    name={currentQuestion.id.toString()}
                                                    value={option.text}
                                                    checked={answers[currentQuestion.id] === option.text}
                                                    onChange={() => handleAnswer(currentQuestion.id, option.text)}
                                                    disabled={isReviewMode}
                                                    className={`w-5 h-5  focus:ring-blue-500 ${isReviewMode && isSelected
                                                        ? 'text-green-600 focus:ring-green-500'
                                                        : 'text-blue-600'
                                                        }`}
                                                />
                                                <span className={`font-medium ${isReviewMode && isSelected
                                                    ? 'text-green-800'
                                                    : 'text-slate-800'
                                                    }`}>
                                                    {option.text}
                                                </span>
                                                {isReviewMode && isSelected && (
                                                    <FaCheck className="ml-auto w-5 h-5 text-green-500" />
                                                )}
                                            </label>
                                        )
                                    })}
                                </div>
                            )}


                            {/* Multipl Choice with checkboxes */}
                            {currentQuestion?.type === 'multiple' && currentQuestion.allowMultiple && (
                                <div className="space-y-2">
                                    {currentQuestion.options?.map(option => {

                                        // for checkboxes: answer is array
                                        const currentAnswers: string[] = Array.isArray(answers[currentQuestion.id])
                                            ? answers[currentQuestion.id]
                                            : []

                                        // console.log('answers',answers)
                                        // console.log('question id', currentQuestion.id)
                                        // let isSelected =false

                                        // if(Array.isArray(answers[currentQuestion.id])){
                                        //    const multipleAnswrs =  answers[currentQuestion.id]
                                        // }
                                        // const isSelected =     answers[currentQuestion.id] === option.text
                                        const isSelected = currentAnswers.includes(option.text);
                                        const toggleCheckBox = () => {
                                            if (isReviewMode) return
                                            let next: string[]
                                            if (isSelected) {
                                                // Remove
                                                next = currentAnswers.filter(text => text !== option.text)
                                            }
                                            else {
                                                // Add
                                                next = [...currentAnswers, option.text]
                                            }
                                            handleAnswer(currentQuestion.id, next)
                                        }
                                        return (
                                            <label
                                                key={option.id}
                                                className={`
                                                flex items-center gap-3 p-3 border-2 rounded-xl transition-all ${isSelected && isReviewMode
                                                        ? 'border-green-500 bg-green-50 shadow-md ring-2 ring-green-200'
                                                        : isSelected
                                                            ? 'border-blue-500 bg-blue-500 shadow-md'
                                                            : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'

                                                    }
                                                ${isReviewMode ? 'cursor-default' : 'cursor-pointer'}
                                                `}
                                            >
                                                {/* Custom checkbox */}
                                                <div className={`
                                                        relative flex-shrink-0 w-5 h-5 rounded border-2 transition-all 
                                                        ${isSelected && isReviewMode
                                                        ? 'border-green-600 bg-green-600'
                                                        : isSelected
                                                            ? 'border-blue-600 bg-blue-600'
                                                            : 'border-slate-400 bg-white'
                                                    }
                                                    `}>
                                                    {isSelected && (
                                                        <FaCheck className={`
                                                                absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white
                                                                ${isReviewMode ? 'text-white' : 'text-white'}
                                                                `}
                                                        />
                                                    )}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={toggleCheckBox}
                                                    disabled={isReviewMode}
                                                    className="sr-only"
                                                />

                                                <span className={`
                                                        flex-1 text-sm font-medium
                                                        ${isSelected && isReviewMode
                                                        ? 'text-green-900'
                                                        : isSelected
                                                            ? 'text-blue-900'
                                                            : 'text-slate-900'

                                                    }
                                                        `}>
                                                    {option.text}
                                                </span>
                                                {isSelected && isReviewMode && (
                                                    <FaCheck className="w-4 h-4 text-green-600" />
                                                )}
                                            </label>
                                        )
                                    })
                                    }
                                </div>
                            )}
                            {/* Rating scale */}
                            {currentQuestion?.type === 'rating' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-slate-700">
                                            {currentQuestion.text}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {answers[currentQuestion.id] ?? 'Not set'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        {/* <span className="text-xs text-slate-500">Low</span> */}
                                        <input
                                            type="range"
                                            min={1}
                                            max={10}
                                            step={1}
                                            value={answers[currentQuestion.id] ?? 0}
                                            onChange={(e) => handleAnswer(currentQuestion.id, Number(e.target.value))}
                                            disabled={isReviewMode}
                                            className="w-full accent-blue-600"
                                        />
                                        {/* <span className="text-xs text-slate-500">High</span> */}
                                    </div>
                                    {!isReviewMode && (
                                        <div className="text-xs text-slate-500">
                                            Selected value: {answers[currentQuestion.id] ?? 'None'}
                                        </div>
                                    )}
                                </div>
                                // <div className="flex flex-wrap gap-3">
                                //     {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => {
                                //         const selectedRating = parseInt(answers[currentQuestion.id] || 0)
                                //         const isFilled = rating <= selectedRating

                                //         return (
                                //             <button
                                //                 key={rating}
                                //                 type="button"
                                //                 onClick={() => handleAnswer(currentQuestion.id, rating.toString())}
                                //                 disabled={isReviewMode}
                                //                 onMouseEnter={(e) => {
                                //                     if (!isReviewMode) {
                                //                         // Highlight all stars up to this one
                                //                         const stars = e.currentTarget.parentElement?.querySelectorAll('button')
                                //                         stars?.forEach((star, idx) => {
                                //                             const starIcon = star.querySelector('svg')
                                //                             if (idx < rating && starIcon) {
                                //                                 starIcon.classList.add('text-yellow-300')
                                //                                 starIcon.classList.remove('text-gray-300')
                                //                             }
                                //                         })
                                //                     }
                                //                 }}
                                //                 onMouseLeave={(e) => {
                                //                     if (!isReviewMode) {
                                //                         const stars = e.currentTarget.parentElement?.querySelectorAll('button')
                                //                         const selected = parseInt(answers[currentQuestion.id]) || 0
                                //                         stars?.forEach((star, idx) => {
                                //                             const starIcon = star.querySelector('svg')
                                //                             if (starIcon) {
                                //                                 if (idx + 1 <= selected) {
                                //                                     starIcon.classList.add('text-yellow-400')
                                //                                     starIcon.classList.remove('text-yellow-300', 'text-gray-300')
                                //                                 } else {
                                //                                     starIcon.classList.add('text-gray-300')
                                //                                     starIcon.classList.remove('text-yellow-300', 'text-yellow-400')
                                //                                 }
                                //                             }
                                //                         })
                                //                     }
                                //                 }}
                                //                 className="transition-transform hover:scale-110"
                                //             >
                                //                 <FaStar
                                //                     className={`w-8 h-8 transition-colors ${isFilled ? 'text-yellow-400' : 'text-gray-300'
                                //                         }`}
                                //                 />
                                //             </button>
                                //         )
                                //     })}
                                //     {answers[currentQuestion.id] && (
                                //         <p className="mt-3 text-center font-semibold text-slate-700">
                                //             {answers[currentQuestion.id]} out of 10
                                //         </p>
                                //     )}

                                // </div>
                            )}

                            {/* Rating with text */}
                            {currentQuestion?.type === 'rating_with_text' && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-slate-700">
                                            {currentQuestion.text}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {answers[currentQuestion.id]?.value ?? 'Not set'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range"
                                            min={1}
                                            max={10}
                                            step={1}
                                            value={answers[currentQuestion.id]?.value ?? 0}
                                            onChange={(e) => handleAnswer(currentQuestion.id, { value: Number(e.target.value), text: '' })}
                                            disabled={isReviewMode}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>
                                    {!isReviewMode && (
                                        <div className="text-xs text-slate-500">
                                            Selected value: {answers[currentQuestion.id]?.value ?? 'None'}
                                        </div>
                                    )}
                                    <div className="pt-2 space-y-3">
                                        <label>Notes / Comments (optional)</label>
                                        <textarea
                                            value={answers[currentQuestion?.id]?.text || ''}
                                            onChange={e => handleAnswer(currentQuestion.id, { value: answers[currentQuestion.id]?.value ?? 0, text: e.target.value })}
                                            disabled={isReviewMode}
                                            className="w-full p-4 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 resize-vertical min-h-[120px] disabled:bg-slate-50 disabled:text-slate-600"
                                            placeholder={isReviewMode ? 'No answer provided' : 'Type your answer here...'}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* True/False */}
                            {currentQuestion?.type === 'true_false' && (
                                <div className="flex gap-6 justify-center">
                                    {/* True Button */}
                                    <button
                                        type="button"
                                        onClick={(() => handleAnswer(currentQuestion.id, "true"))}
                                        disabled={isReviewMode}
                                        className={`
                                            group relative px-12 py-6 rounded-2xl font-bold transition-all duration-300 border-4
                                            ${answers[currentQuestion.id] === 'true'
                                                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white border-green-600 shadow-xl scal-105'
                                                : 'bg-white text-slate-700 border-slate-300 hover:border-green-400 hover:bg-green-50 hover:scale-105 hover:shadow-lg'
                                            }
                                            ${isReviewMode ? 'cursor-default' : 'cursor-pointer'}
                                            `}
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className={`
                                                w-8 h-8 rounded-full border-4 flex items-center justify-center transition-all
                                                ${answers[currentQuestion.id] === 'true'
                                                    ? 'border-white bg-white'
                                                    : 'border-slate-400 group-hover:border-green-500'
                                                }
                                                `}>
                                                {answers[currentQuestion.id] === 'true' && (
                                                    <FaCheck className="w-5 h-5 text-green-600" />
                                                )}
                                            </span>
                                            True
                                        </span>
                                    </button>

                                    {/* False Button */}
                                    <button
                                        type="button"
                                        onClick={(() => handleAnswer(currentQuestion.id, "false"))}
                                        disabled={isReviewMode}
                                        className={`
                                            group relative px-12 py-6 rounded-2xl font-bold transition-all duration-300 border-4
                                            ${answers[currentQuestion.id] === 'false'
                                                ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white border-red-600 shadow-xl scal-105'
                                                : 'bg-white text-slate-700 border-slate-300 hover:border-red-400 hover:bg-red-50 hover:scale-105 hover:shadow-lg'
                                            }
                                            ${isReviewMode ? 'cursor-default' : 'cursor-pointer'}
                                            `}
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className={`
                                                w-8 h-8 rounded-full border-4 flex items-center justify-center transition-all
                                                ${answers[currentQuestion.id] === 'false'
                                                    ? 'border-white bg-white'
                                                    : 'border-slate-400 group-hover:border-red-500'
                                                }
                                                `}>
                                                {answers[currentQuestion.id] === 'false' && (
                                                    <FaCheck className="w-5 h-5 text-red-600" />
                                                )}
                                            </span>
                                            False
                                        </span>
                                    </button>
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
                            className={`inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans ${isFirstQuestion
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : ''
                                }`}
                        // className='inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans'
                        >
                            <FaArrowLeft className="w-4 h-4" />
                            Previous
                        </button>
                        <span className="text-sm text-slate-500 font-medium">
                            {currentIndex + 1} / {totalQuestions}
                        </span>
                        {isLastQuestion ? (
                            <button
                                onClick={handleFinish}
                                disabled={isSubmitting}
                                className={`px-8 py-3 rounded-xl font-bold text-lg flex item-center gap-3 transition-all shadow-lg ${isSubmitting
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 hover:scale-105'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <FaCheck className="w-5 h-5" />
                                        Finish Form
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleNext}
                                disabled={currentQuestion?.required && !isRequiredAnswered()}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gpa-2 transition-all ${currentQuestion?.required && !isRequiredAnswered()
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                    : 'inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans'
                                    }`}

                            >
                                Next
                                <FaArrowRight className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}

                {/* Review Mode Footer */}
                {isReviewMode && (
                    <div className="flex-shrink-0 p-6 border-t bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-green-600 font-semibold">
                            <FaCheck className="w-5 h-5" />
                            Form Completed
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handlePrevious}
                                disabled={isFirstQuestion}
                                className={`px-4 py-2 rounded-xl ${isFirstQuestion ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                <FaArrowLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleNext}
                                disabled={isLastQuestion}
                                className={`px-4 py-2 rounded-xl ${isLastQuestion ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                            >
                                <FaArrowRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onClose}
                                className="inline-flex items-center gap-1.5 bg-accent text-white text-[12.5px] font-semibold py-2 px-3 rounded-[10px] hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
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