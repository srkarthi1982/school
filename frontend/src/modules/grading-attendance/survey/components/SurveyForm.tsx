import { useState, useEffect, ReactNode } from "react"
import { useSurveyStore } from "../stores/surveyStore";
import { useShallow } from "zustand/react/shallow";
import { AnswerOption, Question, QuestionType, Survey } from "../types/survey";
import { FaTimes, FaPlus, FaTrash, FaSave, FaClipboardList, FaRocket, FaExclamationCircle } from 'react-icons/fa'
import { FaAlignLeft, FaList, FaStar } from "react-icons/fa";
import { QuizFormModal } from "../../../assignment-assessment/quiz-bank/components/quiz-form-modal";
import useToastStore from "../../../../infra/shared/store/useToastStore";
export default function SurveyForm({ isOpen, onClose, initialSurvey, onSurveySaved, onSurveyUpdated }:
    {
        isOpen: boolean,
        onClose: () => void,
        initialSurvey?: Survey | null,
        onSurveySaved?: (survey: Survey) => void,
        onSurveyUpdated?: (survey: Survey) => void
    }) {



    // Survey Fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState<'draft' | 'published'>('draft');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [saving, setSaving] = useState(false);

    // New Question Fields
    const [questionText, setQuestionText] = useState('');
    const [questionType, setQuestionType] = useState<QuestionType>('text');
    const [questionweight, setQuestionWeight] = useState(10);
    const [questionRequired, setQuestionRequired] = useState(false);
    const [options, setOptions] = useState<AnswerOption[]>([]);

    //For Adding options
    const [optionText, setOptionText] = useState('');
    const [optionWeight, setOptionWeight] = useState(1);


    useEffect(() => {
        if (!isOpen) return
        if (initialSurvey) {
            // Prefill survey fields for edit
            setTitle(initialSurvey.title || '')
            setDescription(initialSurvey.description || '')
            setStatus(initialSurvey.status || 'draft')
            setQuestions(initialSurvey.questions ? [...initialSurvey.questions] : [])

            //Reset question builder inputs
            setQuestionText('')
            setQuestionType('text')
            setQuestionWeight(10)
            setQuestionRequired(false)
            setOptions([])
        }
        else {
            // New entry -> clear everything
            setTitle('')
            setDescription('')
            setStatus('draft')
            setQuestions([])
            setQuestionText('')
            setQuestionType('text')
            setQuestionWeight(10)
            setQuestionRequired(false)
            setOptions([])
        }
    }, [isOpen, initialSurvey])


    const { addSurvey, updateSurvey } = useSurveyStore(
        useShallow((state) => ({
            addSurvey: state.addSurvey,
            updateSurvey: state.updateSurvey
        }))
    )

    //Add option to current question
    const handleAddOption = () => {
        if (!optionText.trim()) return;

        const newOption: AnswerOption = {
            id: Date.now().toString(),
            text: optionText,
            weight: optionWeight
        }

        setOptions([...options, newOption]);
        setOptionText('');
        setOptionWeight(optionWeight + 1)
    }

    // Remove Option
    const handleRemoveOption = (id: string) => {
        setOptions(options.filter(opt => opt.id !== id))
    }

    // add question to survey
    const handleAddQuestion = () => {
        if (!questionText.trim()) {
            useToastStore.getState().push({ variant: 'warning', title: 'question text required' });
            return;
        }
        if ((questionType === 'multiple' || questionType === 'rating') &&
            options.length === 0) {
            useToastStore.getState().push({ variant: 'warning', title: 'please add at leas one option' });
            return;
        }
        const newQuestion: Question = {
            id: Date.now().toString(),
            text: questionText,
            type: questionType,
            options: questionType !== 'text' ? options : undefined,
            weight: questionweight,
            required: questionRequired
        }

        setQuestions([...questions, newQuestion])

        // Reset Question here
        setQuestionText('');
        setQuestionType('text');
        setQuestionWeight(10);
        setQuestionRequired(false);
        setOptions([])
    }

    // Remove question from survey
    const handleRemoveQuestion = (id: string) => {
        setQuestions(questions.filter(q => q.id !== id))
    }

    // Save Survey
    const handleSaveSurvey = () => {
        if (!title.trim()) {
            useToastStore.getState().push({ variant: 'warning', title: 'title required' })
            return;
        }
        setSaving(true);
        try {
            const payload = {
                title: title.trim(),
                description: description.trim(),
                questions,
                status
            }
            if (initialSurvey && initialSurvey.id) {
                // Update Existing
                updateSurvey(initialSurvey.id, {
                    ...initialSurvey,
                    ...payload
                })
                onSurveyUpdated?.({ ...initialSurvey, ...payload });
                useToastStore.getState().push({ variant: 'success', title: 'Survey Updated' })
            }
            else {
                // Create New
                addSurvey(payload)
                useToastStore.getState().push({ variant: 'success', title: `Survery saved with ${questions.length} questions!` })

                //Reset form
                setTitle('')
                setDescription('')
                setQuestions([]);
                setStatus('draft');

            }
        } catch (error) {
            console.error(error)
            useToastStore.getState().push({ variant: 'error', title: 'Save Survey failed' });
            setSaving(false);
        }
        finally {
            setSaving(false)
            onClose()
        }


    }

    interface QuestionTypeSelector {
        type: string;
        icon: any;
        label: string;
        color: string
    }
    const questionTypeSelectors: QuestionTypeSelector[] = [
        { type: 'text', icon: FaAlignLeft, label: 'Free Text', color: 'blue' },
        { type: 'multiple', icon: FaList, label: 'Multiple Choice', color: 'green' },
        { type: 'rating', icon: FaStar, label: 'Rating Scale', color: 'yellow' }
    ]


    // Helper: get question by id
    const getQuestion = (qId: string) => {
        return questions.find(q => q.id === qId) as Question
    }

    // Update question text
    const updateQuestionText = (qId: string, text: string) => {
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, text } : q))
    }

    // Update question type
    const updateQuestionType = (qId: string, type: QuestionType) => {
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, type, options: type === 'text' ? undefined : (q.options ?? []) } : q))
    }

    // Update question weight
    const updateQuestionWeight = (qId: string, weight: number) => {
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, weight } : q))
    }

    // Toggle Required
    const toggleQuestionRequired = (qId: string) => {
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, required: !q.required } : q))
    }

    // Add option to question
    const addOptionToQeustion = (qId: string, option: AnswerOption) => {
        setQuestions(prev => prev.map(q => q.id === qId ? { ...q, options: [...(q.options ?? []), option] } : q))
    }

    // Remove option from question
    const removeOptionFromQuestion =(qId:string,optionId:string)=>{
        setQuestions(prev=>prev.map(q=>q.id===qId ?{...q,options:(q.options??[]).filter(o=>o.id !== optionId)}:q))
    }

    // Update option in question
    const updateOptionInQuestion = (qId:string,optionId:string,updates:Partial<AnswerOption>)=>{
        setQuestions(prev=>prev.map(q=>q.id===qId?{...q,options:(q.options??[]).map(o=>o.id===optionId?{...o,...updates}:o)}:q))
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex justify-end p-4 bg-black/40">
            <div className="w-full max-w-4xl bg-white shadow-2xl flex flex-col h-screen">

                {/* Header */}
                <div className="flex-shrink-0 p-6 border-b flex item-center justify-between bg-gradient-to-r from-slate-50 to-gray-50">
                    <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                        <FaClipboardList className="w-7 h-7 text-blue-600" />
                        {initialSurvey ? 'Edit Survey' : 'Create Survey'}
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-200 transition-colors p-1.5" disabled={saving}>
                        <FaTimes className="w-6 h-6 text-slate-600 hover:text-slate-900" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Survey Info */}
                    <div className="w-1/3 p-6 border-r bg-gradient-to-b from-slate-50 space-y-6 overflow-y-auto">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                <FaAlignLeft className="w-4 h-4 text-blue-500" />
                                Title
                            </label>
                            <input value={title} onChange={e => setTitle(e.target.value)}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 shadow-sm" placeholder="Enter Survery Title" disabled={saving} />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                <FaAlignLeft className="w-4 h-4 text-green-500" />
                                Description
                            </label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)}
                                rows={3}
                                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500 resize-vertical shadow-sm" placeholder="Enter description." disabled={saving} />
                        </div>

                        <div className="flex items-center gap-3 p-4 bg-blue-50 border-2 border-blue-100 rounded-xl">
                            <input type="checkbox" checked={status === "published"} onChange={e => setStatus(e.target.checked ? 'published' : 'draft')}
                                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500" />
                            <label className="text-sm font-semibold flex items-center gap-2">
                                {status === 'published' ? (
                                    <>
                                        <FaRocket className="w-4 h-4 text-green-500" />
                                        Publish
                                    </>
                                ) : (
                                    <>
                                        <FaSave className="w-4 h-4 text-yellow-500" />
                                        Save Draft
                                    </>
                                )}
                            </label>
                        </div>

                        {/* Questions Summary */}
                        <div className="p-5 bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-dashed border-emerald-200 rounded-2xl text-center shadow-inner">
                            <FaClipboardList className="w-12 h-12 mx-auto mb-3 text-emerald-600 opacity-80" />
                            <div className="text-2xl font-black text-emerald-800 mb-1">
                                {questions.length}
                            </div>
                            <div className="text-sm text-emerald-700 font-semibold uppercase tracking-rule">
                                Questions Added
                            </div>
                        </div>
                    </div>


                    {/* Right Panel : Question Builder */}

                    <div className="w-2/3 p-6 space-y-6 overflow-y-auto">
                        {/* Add  Question Section */}
                        <div className="p-6 bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 border-2 border-dashed border-indigo-200 rounded-3xl shadow-lg">
                            <h4 className="text-xl font-bold mb-6 flex items-center gap-3 text-slate-800">
                                <FaPlus className="w-6 h-6 text-indigo-600" />
                                Add New Question
                            </h4>

                            {/* Question Type Selector */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">


                                {questionTypeSelectors.map((item, index) => {
                                    const Icon = item.icon;
                                    return (

                                        <button key={item.type}
                                            className={`group p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 hover:shadow-lg hover:-translate-y-1 ${questionType === item.type ? `border-${item.color}-500 bg-${item.color}-100 shadow-md ring-2 ring-${item.color}-200 ring-offset-2` :
                                                `border-gray-200 hover:border-${item.color}-300 hover:bg-${item.color}-50`}`}
                                            onClick={() => {
                                                setQuestionType(item.type as QuestionType)
                                                setOptions([]) // Clear options when type changes
                                            }}
                                            type="button"
                                        >
                                            <Icon className={`w-8 h-8 text-${item.color}-600 group-hover:scale-110 transition-transform`} />
                                            <span className="text-sm font-bold text-slate-800">{item.label}</span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Question Text */}

                            <div className="mb-4">
                                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                    <FaAlignLeft className="w-4 h-4 text-gray-500" />
                                    Question Text
                                </label>
                                <input
                                    value={questionText}
                                    onChange={e => setQuestionText(e.target.value)}
                                    placeholder="What is your question?"
                                    className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-3 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm text-lg"
                                />
                            </div>

                            {/* Weight */}
                            <div className="mb-4">
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Question Weight
                                </label>
                                <input
                                    type="number"
                                    value={questionweight}
                                    onChange={e => setQuestionWeight(Number(e.target.value))}
                                    className="w-full p-4 border-2 border-slate-200 rounded-xl focus:ring-3 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm text-lg"
                                    min="1"
                                />
                            </div>

                            {/* Options Section (Multiple Choice or Rating) */}
                            {(questionType === 'multiple' || questionType === 'rating') && (
                                <div className="mb-4 p-4 bg-white border-2 border-green-200 rounded-xl">
                                    <label className="block text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <FaList className="w-4 h-4 text-green-500" />
                                        Answer Options
                                    </label>

                                    {/* Add Option Form */}
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="text"
                                            placeholder="Option Text"
                                            value={optionText}
                                            onChange={e => setOptionText(e.target.value)}
                                            className="flex-1 p-3 border rounded-lg"
                                            onKeyDown={e => e.key === 'Enter' && handleAddOption()}
                                        />
                                        <input
                                            type="number"
                                            placeholder="Weight"
                                            value={optionWeight}
                                            onChange={e => setOptionWeight(Number(e.target.value))}
                                            className="w-24 p-3 border rounded-lg"
                                            min="1"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddOption}
                                            className="px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
                                        >
                                            <FaPlus className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Options List */}
                                    {options.length > 0 && (
                                        <div className="space-y-2">
                                            {options.map((opt, index) => (
                                                <div
                                                    key={opt.id}
                                                    className="flex items-center justify-between p-3 bg-gray-50 border rounded-lg group hover:bg-gray-100"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono text-sm text-gray-500">#{index + 1}</span>
                                                        <span className="font-medium">{opt.text}</span>
                                                        <span className="text-xs text-gray-500">Weight:{opt.weight}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveOption(opt.id)}
                                                        className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <FaTrash className="w-4 h-4 text-red-500" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* Required Checkbox + Add Question Button */}
                            <div className="flex items-center gap-4 pt-4 border-t">
                                <label className="flex items-center gap-2 text-sm font-semibold">
                                    <input
                                        type="checkbox"
                                        checked={questionRequired}
                                        onChange={e => setQuestionRequired(e.target.checked)}
                                        className="w-5 h-5 rounded"
                                    />
                                    <span className="flex items-center gap-1">
                                        Required
                                        {questionRequired && <FaExclamationCircle className="w-4 h-4 text-red-500" />}
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleAddQuestion}
                                    disabled={!questionText.trim()}
                                    className={`ml-auto px-8 py-3 rounded-2xl font-bold flex item-center gap-3 transition-all shadow-lg ${!questionText.trim()
                                        ? 'bg-gray-400 cursor-not-allowed text-gray-600'
                                        : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700'
                                        }`}
                                >
                                    <FaPlus className="w-4 h-4" />
                                    Add Question
                                </button>
                            </div>
                        </div>

                        {/* Editable Questions List */}
                        {questions.length>0 && (
                            <div className="space-y-4">
                                <h4 className="text-xl font-bold flex items-center gap-3 border-b pb-3 text-slate-800">
                                    <FaClipboardList className="w-6 h-6 text-green-600"/>
                                    Questions ({questions.length})
                                </h4>

                                <div className="space-y-4">
                                    {questions.map((q,index)=>(
                                        <div
                                            key={q.id}
                                            className="group p-6 bg-white border-2 border-slate-200 rounded-2xl shadow-sm hover:shadow-lg hover:border-blue-300 transition-all"

                                        >
                                            {/* Question Header With Delete */}
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
                                                    {q.type==='text' && <FaAlignLeft className="w-5 h-5 text-blue-500"/>}
                                                    {q.type==='multiple' && <FaList className="w-5 h-5 text-green-500"/>}
                                                    {q.type==='rating' && <FaStar className="w-5 h-5 text-yellow-500"/>}
                                                    <span>Question {index+1}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={()=>handleRemoveQuestion(q.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 rounded-xl transition-all"
                                                    title="Delete Question"
                                                >
                                                    <FaTrash className="w-5 h-5 text-red-500"/>
                                                </button>
                                            </div>

                                            {/* Editable Question Text */}
                                            <div className="mb-4">
                                                <label  className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
                                                    Question Text
                                                </label>
                                                <input
                                                    type="text"
                                                    value={q.text}
                                                    onChange={e=>updateQuestionText(q.id,e.target.value)}
                                                    className="w-full p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-slate-900"
                                                    placeholder="Enter question..."
                                                />
                                            </div>

                                            {/* Question Settings Row */}
                                            <div className="grid grid-cols-1 mb:grid-cols-3 gap-4 mb-4">
                                                {/* Type Selector */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">
                                                        Type
                                                    </label>
                                                    <select
                                                        value={q.type}
                                                        onChange={e=>updateQuestionType(q.id,e.target.value as QuestionType)}
                                                        className="w-full p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white"
                                                    >
                                                        <option value="text">Free Text</option>
                                                        <option value="multiple">Multiple Choice</option>
                                                        <option value="rating">Rating Scale</option>
                                                    </select>
                                                </div>

                                                {/* Weight */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">
                                                        Weight
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={q.weight}
                                                        onChange={e=>updateQuestionWeight(q.id,Number(e.target.value))}
                                                        className="w-full p-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                                                        min="1"
                                                    />
                                                </div>

                                                {/* Required Toggle */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase">
                                                        Status
                                                    </label>
                                                    <label className="flex items-center gap-3 p-3 border-2 border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={q.required}
                                                            onChange={()=>toggleQuestionRequired(q.id)}
                                                            className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                            Required
                                                            {q.required && <FaExclamationCircle className="w-4 h-4 text-red-500"/>}
                                                        </span>
                                                    </label>
                                                </div>

                                            </div>

                                            {/* Options Editor (for mulitple/rating) */}
                                            {(q.type==='multiple' || q.type==='rating') && (
                                                <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-dashed border-green-200 rounded-2xl">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                                            <FaList className="w-4 h-4 text-green-600"/>
                                                            Answer Options
                                                        </label>
                                                        <span className="text-xs text-slate-500">{q.options?.length || 0}</span>
                                                    </div>

                                                    {/* Existing Options */}
                                                    <div className="space-y-2 mb-3">
                                                        {(q.options ?? []).map((opt,optIndex)=>(
                                                            <div
                                                                key={opt.id}
                                                                className="group/opt flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl hover:border-green-300 transition-all"
                                                            >
                                                                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg text-sm font-bold">
                                                                    {optIndex + 1}
                                                                </span>
                                                                <input
                                                                    type="text"
                                                                    value={opt.text}
                                                                    onChange={e=>updateOptionInQuestion(q.id,opt.id,{text:e.target.value})}
                                                                    className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                                                    placeholder={`Option ${optIndex + 1}`}
                                                                />
                                                                <input
                                                                    type="number"
                                                                    value={opt.weight??1}
                                                                    onChange={e=>updateOptionInQuestion(q.id,opt.id,{weight:Number(e.target.value)})}
                                                                    className="w-20 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500"
                                                                    placeholder="Weight"
                                                                    min="1"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={()=>removeOptionFromQuestion(q.id,opt.id)}
                                                                    className="flex-shrink-0 p-2 opacity-0 group-hover/opt:opacity-100 hover:bg-red-50 rounded-lg transition-all"
                                                                >
                                                                    <FaTrash className="w-4 h-4 text-red-500"/>
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Add New Option Inline */}
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            id={`new-opt-text-${q.id}`}
                                                            type="text"
                                                            placeholder="New option text..."
                                                            className="flex-1 p-3 border-2 border-dashed border-green-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                                            onKeyDown={e=>{
                                                                if(e.key==='Enter'){
                                                                    e.preventDefault()
                                                                    const input =document.getElementById(`new-opt-text-${q.id}`) as HTMLInputElement
                                                                    const text= input?.value?.trim()
                                                                    if(!text) return
                                                                    const newOpt:AnswerOption={
                                                                        id:Date.now().toString(),
                                                                        text,
                                                                        weight:(q.options?.length??0) + 1
                                                                    }
                                                                    addOptionToQeustion(q.id,newOpt)
                                                                    input.value=''
                                                                }
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={()=>{
                                                                const input =document.getElementById(`new-opt-text-${q.id}`) as HTMLInputElement
                                                                const text =input?.value?.trim()
                                                                if(!text) return
                                                                const newOpt:AnswerOption={
                                                                    id:Date.now().toString(),
                                                                    text,
                                                                    weight:(q.options?.length?? 0) + 1
                                                                }
                                                                addOptionToQeustion(q.id,newOpt);
                                                                input.value=''
                                                            }} 
                                                            className="flex-shrink-0 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                                                        >
                                                            <FaPlus className="w-4 h-4"/>
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {/* {questions.length > 0 && (
                            <div className="space-y-4">
                                <h4 className="text-xl font-bold flex items-center gap-3 text-slate-800 border-b pb-3">
                                    <FaClipboardList className="w-6 h-6 text-green-600" />
                                    Questions ({questions.length})
                                </h4>
                                <div className="space-y-3 ">
                                    {questions.map((question, index) => (
                                        <div
                                            key={question.id}
                                            className="group p-6 bg-white border-l-4 rounded-2xl shadow-sm hover:shadow-md transition-all border-l-blue-500 hover:-translate-x-l"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-start gap-3 flex-1">
                                                    {question.type === 'text' && <FaAlignLeft className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />}
                                                    {question.type === 'multiple' && <FaList className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />}
                                                    {question.type === 'rating' && <FaStar className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />}


                                                    <div className="font-semibold text-slate-900">
                                                        Q{index + 1}:{question.text}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1">
                                                        Weight: {question.weight} | Type: {question.type}
                                                        {question.required && (
                                                            <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-bold">
                                                                Required
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                            </div>
                                            <button
                                                onClick={() => handleRemoveOption(question.id)}
                                                className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 rounded-xl transition-all"
                                            >
                                                <FaTrash className="w-4 h-4 text-red-500" />
                                            </button>
                                            {question.options && question.options.length > 0 && (
                                                <div className="ml-11 pl-4 space-y-1 border-l-2 border-slate-200">
                                                    {question.options.map((opt, optIndex) => (
                                                        <div key={opt.id} className="text-sm text-slate-600 flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                                                            {opt.text} <span className="text-xs text-slate-400">(weight:{opt.weight}</span>
                                                        </div>

                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                    ))}

                                </div>
                            </div>
                        )} */}
                    </div>

                </div>

                {/* Footer */}
                <div className="flex-shrink-0 p-6 border-t bg-slate-50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-8 py-3 border-2 border-slate-300 rounded-2xl text-slate-700 font-semibold hover:bg-slate-50 hover:border-slate-400 transition-all shadow-md flex items-center gap-2"
                        disabled={saving}
                    >
                        <FaTimes className="w-4 h-4" />
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveSurvey} // todo
                        disabled={!title.trim() || saving}
                        className={`px-10 py-3 rounded-2xl font-bold text-lg flex items-center gap-3 transition-all shadow-xl ${!title.trim() || saving
                            ? 'bg-transparent-to-r from-gray-400 to-gray-500 text-gray-300 cursor-not-allowed'
                            : 'bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 text-white hover:from-emerald-600 hover:via-green-600 hover:to-emerald-700 hover:shadow-2xl hover:scale-[1.02]'
                            }`}
                    >
                        {saving ? (
                            <>
                                <div className="w-6 h-6 border-2 border-white/30 rounded-full border-t-white animate-spin" />
                                Saving...
                            </>
                        )
                            : (
                                <>
                                    <FaSave className="w-5 h-5" />
                                    {initialSurvey ? 'Update Survey' : `Save Survey (${questions.length} questions)`}
                                </>
                            )
                        }
                    </button>
                </div>
            </div>
        </div>

    )
}