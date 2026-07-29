import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { HiOutlineArrowLeft, HiOutlineBookOpen, HiOutlineCheckCircle, HiOutlineArrowUpOnSquare, HiOutlineEye, HiOutlineEyeSlash } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import {
  saveFormGrading,
  saveAllFormGradingNew,
  fetchGradingFormEntities,
  fetchFormStudentResponse,
} from '../api'
import useStore from '../store'

interface FormQuestionWithAnswer {
  id: number
  question: string
  type: 'text' | 'multiple' | 'rating' | 'true_false'
  maxScore: number
  studentAnswer: string
  formName: string
}

export default function FormGradingPage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>()
  const { t } = useI18n()
  const showToast = useToast()
  const navigate = useNavigate()

  const { selectedCourse, selectedStudent, setActiveTab, loadStudents, getCourses, formAnswers, setFormAnswer, setFormAnswersFromStorage } = useStore(useShallow(s => ({
    selectedCourse: s.selectedCourse,
    selectedStudent: s.selectedStudent,
    setActiveTab: s.setActiveTab,
    loadStudents: s.loadStudents,
    getCourses: s.getCourses,
    formAnswers: s.formAnswers,
    setFormAnswer: s.setFormAnswer,
    setFormAnswersFromStorage: s.setFormAnswersFromStorage,
  })))

  const [questions, setQuestions] = useState<FormQuestionWithAnswer[]>([])
  const [loading, setLoading] = useState(true)
  const [showNonText, setShowNonText] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [formId, setFormId] = useState<number | null>(null)

  const handleSave = useCallback(async (questionId: number) => {
    const existing = formAnswers[questionId]
    const score = existing?.score
    const note = existing?.note || ''
    if (score === null || !formId) return
    try {
      await saveFormGrading({
        student_id: Number(studentId!),
        form_id: formId,
        question_id: questionId,
        score: score,
        note: note || undefined,
      })
      showToast.success({ title: 'Form grade saved' })
    } catch {
      showToast.error({ title: t('grading.saveError') })
    }
  }, [formAnswers, formId, studentId, showToast, t])

  const handleSaveAll = useCallback(async (courseId: string, studentId: string, activeTab: string) => {
    setSavingAll(true)
    try {
      const entries = Object.entries(formAnswers).filter(([, v]) => v.score !== null)
      const payloads = entries.map(([id, { score, note }]) => ({
        student_id: Number(studentId),
        form_id: formId!,
        question_id: Number(id),
        score: score!,
        note: note || undefined,
      }))
      await saveAllFormGradingNew(payloads)
      showToast.success({ title: t('grading.gradeSaved') })
    } catch {
      showToast.error({ title: t('grading.saveError') })
    } finally {
      setSavingAll(false)
    }
  }, [formAnswers, formId, showToast, t])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      if (courseId) await loadStudents(Number(courseId))
      if (courseId) await getCourses()
      setActiveTab('form')

      const gradeMap: Record<number, { score: number | null; note: string }> = {}
      const questions: FormQuestionWithAnswer[] = []

      try {
        const formData = await fetchGradingFormEntities(Number(courseId), studentId ? Number(studentId) : undefined)
        const formQuestions = (formData as any).questions || []
        const fIds = (formData as any).form_ids || []
        if (fIds.length > 0) setFormId(fIds[0])
        for (const q of formQuestions) {
          gradeMap[q.question_id] = { score: q.grade, note: (q.note as string) || '' }
          questions.push({
            id: q.question_id,
            question: q.question_text,
            type: q.question_type as FormQuestionWithAnswer['type'],
            maxScore: q.weight,
            studentAnswer: '',
            formName: selectedCourse?.title || 'Form',
          })
        }
        // Fetch student form responses for text answers
        if (studentId && fIds.length > 0) {
          const response = await fetchFormStudentResponse(fIds[0], Number(studentId)).catch(() => null)
          if (response?.answers) {
            const answers: Record<string, string> = response.answers
            for (const [qId, text] of Object.entries(answers)) {
              const idx = questions.findIndex(q => q.id === Number(qId))
              if (idx >= 0) {
                questions[idx].studentAnswer = text || ''
              }
            }
          }
        }
      } catch { /* ignore, will show empty */ }

      setFormAnswersFromStorage(gradeMap)
      setQuestions(questions)
      setLoading(false)
    })()
  }, [courseId, studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScoreChange = (questionId: number, value: string) => {
    const num = value === '' ? null : Math.min(100, Math.max(0, parseInt(value, 10)))
    const existing = formAnswers[questionId]
    setFormAnswer(questionId, num, existing?.note || '')
  }

  const handleNoteChange = (questionId: number, value: string) => {
    const existing = formAnswers[questionId]
    setFormAnswer(questionId, existing?.score || null, value)
  }

  const handleBack = () => {
    navigate('/grading-attendance/grading/course-pick/' + courseId)
  }

  if (loading) return <p className="text-muted">{t('grading.loading')}</p>
  if (savingAll) return <p className="text-muted text-sm">{t('grading.saving')}</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <button onClick={handleBack} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0">
          <HiOutlineArrowLeft className="text-[14px]" /> {t('grading.backToStudents')}
        </button>
        <button onClick={() => setShowNonText(!showNonText)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs border-none cursor-pointer font-sans transition-colors ${showNonText ? 'bg-surface-2 text-primary border border-bd' : 'bg-transparent text-muted border border-transparent'}`}>
          {showNonText ? <HiOutlineEyeSlash className="text-[12px]" /> : <HiOutlineEye className="text-[12px]" />}
          {t('grading.showNonTextAnswers')}
        </button>
      </div>

      {selectedStudent && selectedCourse && (
        <div className="flex items-center gap-3 pb-4 border-b border-bd">
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-white">{selectedStudent.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}</span>
          </div>
          <div>
            <p className="text-[15px] font-bold text-primary">{selectedStudent.full_name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-light text-accent">
                {t('grading.form')}
              </span>
              <span className="text-[11px] text-muted">{selectedCourse.title}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {(() => {
          const visible = questions.filter(q => q.type === 'text' || showNonText)
          return visible.map((q, index) => {
            const answer = formAnswers[q.id]
            return (
              <FormQuestionCard
                key={q.id}
                index={index + 1}
                total={visible.length}
                question={q.question}
                studentAnswer={q.studentAnswer}
                score={answer?.score}
                note={answer?.note || ''}
                formName={q.formName}
                maxScore={q.maxScore}
                onScoreChange={(val) => handleScoreChange(q.id, val)}
                onNoteChange={(val) => handleNoteChange(q.id, val)}
                onSave={() => handleSave(q.id)}
              />
            )
          })
        })()}
      </div>

      <button
        onClick={() => handleSaveAll(courseId!, studentId!, 'form')}
        disabled={!studentId || savingAll}
        className="fixed bottom-4 right-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
      >
        {savingAll ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiOutlineArrowUpOnSquare className="text-[14px]" />}
        {savingAll ? t('grading.saving') : t('grading.saveAllGrading')}
      </button>
    </div>
  )
}

function FormQuestionCard({ index, total, question, studentAnswer, score, note, formName, maxScore, onScoreChange, onNoteChange, onSave }: {
  index: number; total: number; question: string; studentAnswer: string; score: number | null; note: string; formName: string; maxScore: number; onScoreChange: (val: string) => void; onNoteChange: (val: string) => void; onSave: () => void
}) {
  const hasError = score !== null && score > maxScore

  return (
    <div className="card p-0 overflow-hidden">
      <div style={{ background: 'var(--navy)' }} className="px-4 py-3">
        <p className="text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{index} / {total} — {formName}</p>
        <p className="text-[13px] font-semibold text-white/90 mt-0.5">{question}</p>
      </div>
      <div className="px-5 py-4" style={{ background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase mb-2">Student Answer</p>
        <p className="text-[13px] text-secondary leading-relaxed">{studentAnswer}</p>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-[12px] font-semibold text-secondary shrink-0">Score:</label>
          <input type="number" min={1} max={maxScore} value={score ?? ''} onChange={(e) => onScoreChange(e.target.value)} className="w-[80px] h-[38px] px-3 rounded-[9px] bg-[var(--surface)] text-primary text-sm font-medium outline-none transition-[border-color] duration-150 ease-in-out border" style={hasError ? { borderColor: 'var(--danger)' } : { borderColor: 'var(--border)' }} onFocus={e => { if (!hasError) e.target.style.borderColor = 'var(--accent)' }} onBlur={e => { if (!hasError) e.target.style.borderColor = 'var(--border)' }} />
          <span className="text-[11px] text-muted">/ {maxScore}</span>
          <button onClick={onSave} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans">
            <HiOutlineCheckCircle className="text-[12px]" /> Save
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-semibold text-secondary">Note:</label>
          <textarea value={note} onChange={(e) => onNoteChange(e.target.value)} rows={2} className="px-3 py-2 rounded-lg bg-[var(--surface)] text-primary text-sm font-sans outline-none transition-[border-color] duration-150 ease-in-out border resize-y" style={{ borderColor: 'var(--border)' }} onFocus={e => { e.target.style.borderColor = 'var(--accent)' }} onBlur={e => { e.target.style.borderColor = 'var(--border)' }} />
        </div>
      </div>
    </div>
  )
}
