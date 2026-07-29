import { useEffect, useState, useCallback } from 'react'
import { HiOutlineArrowLeft, HiOutlineCheckCircle, HiOutlineArrowUpOnSquare, HiOutlineEye, HiOutlineEyeSlash } from 'react-icons/hi2'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useI18n } from '../../../../infra/locales/I18nContext'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import { useToast } from '../../../../infra/shared/store/useToastStore'
import { saveQuizGrading, saveAllQuizGradingNew, fetchGradingQuizEntities, fetchQuizAttempt } from '../api'
import useStore from '../store'

interface QuizQuestionWithAnswer {
  id: number
  question: string
  type: string
  maxScore: number
  studentAnswer: string
  quizName: string
}

export default function QuizGradingPage() {
  const { courseId, studentId } = useParams<{ courseId: string; studentId: string }>()
  const { t } = useI18n()
  const showToast = useToast()
  const navigate = useNavigate()

  const {
    selectedCourse,
    selectedStudent,
    setActiveTab,
    setSelectedStudent,
    quizAnswers,
    setQuizAnswer,
    setQuizAnswersFromStorage,
    loadStudents,
    getCourses,
  } = useStore(useShallow(s => ({
    selectedCourse: s.selectedCourse,
    selectedStudent: s.selectedStudent,
    setActiveTab: s.setActiveTab,
    setSelectedStudent: s.setSelectedStudent,
    quizAnswers: s.quizAnswers,
    setQuizAnswer: s.setQuizAnswer,
    setQuizAnswersFromStorage: s.setQuizAnswersFromStorage,
    loadStudents: s.loadStudents,
    getCourses: s.getCourses,
  })))

  // ── State ──
  const [questions, setQuestions] = useState<QuizQuestionWithAnswer[]>([])
  const [loading, setLoading] = useState(true)
  const [showNonText, setShowNonText] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [quizId, setQuizId] = useState<number | null>(null)

  const handleSave = useCallback(async (questionId: number) => {
    const a = quizAnswers[questionId]
    if (a?.score === null || !quizId) return
    try {
      await saveQuizGrading({
        student_id: Number(studentId!),
        quiz_id: quizId,
        question_id: questionId,
        score: a.score,
        note: a.note || undefined,
      })
      showToast.success({ title: 'Grade saved' })
    } catch {
      showToast.error({ title: t('grading.saveError') })
    }
  }, [quizAnswers, quizId, studentId, showToast, t])

  const handleSaveAll = useCallback(async (courseId: string, studentId: string, activeTab: string) => {
    setSavingAll(true)
    try {
      const entries = Object.entries(quizAnswers).filter(([, v]) => v.score !== null)
      const grades = entries.map(([id, { score, note }]) => ({
        student_id: Number(studentId),
        quiz_id: quizId!,
        question_id: Number(id),
        score: score!,
        note,
      }))
      await saveAllQuizGradingNew(grades)
      showToast.success({ title: t('grading.gradeSaved') })
    } catch {
      showToast.error({ title: t('grading.saveError') })
    } finally {
      setSavingAll(false)
    }
  }, [quizAnswers, quizId, showToast, t])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await loadStudents(Number(courseId))
      await getCourses()
      setActiveTab('quiz')

      let quizQuestions: any[] = []
      const gradeMap: Record<number, { score: number | null; note: string }> = {}
      const questions: QuizQuestionWithAnswer[] = []

      try {
        const quizData = await fetchGradingQuizEntities(Number(courseId), studentId ? Number(studentId) : undefined)
        const qList = (quizData as any).questions || []
        quizQuestions = qList
        const qIds = (quizData as any).quiz_ids || []
        if (qIds.length > 0) setQuizId(qIds[0])
        for (const q of qList) {
          gradeMap[q.question_id] = { score: q.grade, note: (q.note as string) || '' }
          questions.push({
            id: q.question_id,
            question: q.question_text,
            type: q.question_type,
            maxScore: q.weight,
            studentAnswer: '',
            quizName: selectedCourse?.title || 'Quiz',
          })
        }
        // Fetch student attempts for text-based answers
        if (studentId && qIds.length > 0) {
          const attempt = await fetchQuizAttempt(qIds[0], Number(studentId)).catch(() => null)
          const answers: any[] = attempt?.answers || []
          // Match answers to questions by position
          for (let i = 0; i < questions.length && i < answers.length; i++) {
            const ans = answers[i]
            const studentAnswer = ans.text || (Array.isArray(ans.answer) ? ans.answer.join(', ') : String(ans.answer || ''))
            if (studentAnswer) {
              questions[i].studentAnswer = studentAnswer
            }
          }
        }
      } catch { /* ignore, will show empty */ }

      setQuizAnswersFromStorage(gradeMap)
      setQuestions(questions)
      setLoading(false)
    })()
  }, [courseId, studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScoreChange = (questionId: number, value: string) => {
    const num = value === '' ? null : Math.min(100, Math.max(0, parseInt(value, 10)))
    const existing = quizAnswers[questionId]
    setQuizAnswer(questionId, num, existing?.note || '')
  }

  const handleNoteChange = (questionId: number, value: string) => {
    const existing = quizAnswers[questionId]
    setQuizAnswer(questionId, existing?.score || null, value)
  }

  const handleBack = useCallback(() => {
    navigate('/grading-attendance/grading/course-pick/' + courseId)
  }, [navigate, courseId])

  if (loading) {
    return <p className="text-muted text-sm">{t('grading.loading')}</p>
  }

  if (savingAll) {
    return <p className="text-muted text-sm">{t('grading.saving')}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          {t('grading.backToStudents')}
        </button>
        <button
          onClick={() => setShowNonText(!showNonText)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs border-none cursor-pointer font-sans transition-colors ${
            showNonText
              ? 'bg-surface-2 text-primary border border-bd'
              : 'bg-transparent text-muted border border-transparent'
          }`}
        >
          {showNonText ? (
            <HiOutlineEyeSlash className="text-[12px]" />
          ) : (
            <HiOutlineEye className="text-[12px]" />
          )}
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
                {t('grading.quiz')}
              </span>
              <span className="text-[11px] text-muted">{selectedCourse.title}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {(() => {
          const visible = questions.filter(q => q.type === 'essay' || showNonText)
          return visible.map((q, index) => {
            const answer = quizAnswers[q.id]
            return (
              <QuestionCard
                key={q.id}
                index={index + 1}
                total={visible.length}
                question={q.question}
                type={q.type}
                maxScore={q.maxScore}
                studentAnswer={q.studentAnswer}
                score={answer?.score}
                note={answer?.note || ''}
                quizName={q.quizName}
                onScoreChange={(val) => handleScoreChange(q.id, val)}
                onNoteChange={(val) => handleNoteChange(q.id, val)}
                onSave={() => handleSave(q.id)}
              />
            )
          })
        })()}
      </div>
      <button
        onClick={() => handleSaveAll(courseId!, studentId!, 'quiz')}
        disabled={!studentId || savingAll}
        className="fixed bottom-4 right-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
      >
        {savingAll ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <HiOutlineArrowUpOnSquare className="text-[14px]" />}
        {savingAll ? t('grading.saving') : t('grading.saveAllGrading')}
      </button>
    </div>
  )
}

function QuestionCard({
  index,
  total,
  question,
  type,
  maxScore,
  studentAnswer,
  score,
  note,
  quizName,
  onScoreChange,
  onNoteChange,
  onSave,
}: {
  index: number
  total: number
  question: string
  type: string
  maxScore: number
  studentAnswer: string
  score: number | null
  note: string
  quizName: string
  onScoreChange: (val: string) => void
  onNoteChange: (val: string) => void
  onSave: () => void
}) {
  const { t } = useI18n()

  const hasError = (() => {
    if (score === null) return false
    if (score > maxScore) return true
    return false
  })()

  return (
    <div className="card p-0 overflow-hidden flex flex-col">
      <div
        style={{ background: 'var(--navy)' }}
        className="px-4 py-3 flex items-center justify-between gap-2"
      >
        <div>
          <p className="text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">
            {index} / {total} — {quizName}
          </p>
          <p className="text-[13px] font-semibold text-white/90 mt-0.5">{question}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-white/70 capitalize">
            {type.replace('_', ' ')}
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] font-bold text-[var(--success)]">{score ?? '/'}{maxScore}</p>
        </div>
      </div>

      {/* Student answer */}
      <div className="px-5 py-4" style={{ background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase mb-2">
          {t('grading.studentAnswer')}
        </p>
        <p className="text-[13px] text-secondary leading-relaxed">{studentAnswer}</p>
      </div>

      {/* Grading controls */}
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-[12px] font-semibold text-secondary shrink-0">{t('grading.score')}:</label>
            <input
              type="number"
              min={1}
              max={maxScore}
              value={score ?? ''}
              onChange={(e) => onScoreChange(e.target.value)}
              className="w-[80px] h-[38px] px-3 rounded-[9px] bg-[var(--surface)] text-primary text-sm font-medium outline-none transition-[border-color] duration-150 ease-in-out border"
              style={hasError ? { borderColor: 'var(--danger)' } : {}}
              onFocus={e => { if (!hasError) e.target.style.borderColor = 'var(--accent)' }}
              onBlur={e => { if (!hasError) e.target.style.borderColor = 'var(--border)' }}
            />
            <span className="text-[11px] text-muted">/ {maxScore}</span>
          </div>
          <button
            onClick={onSave}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans"
          >
            <HiOutlineCheckCircle className="text-[12px]" />
            {t('grading.save')}
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-semibold text-secondary">{t('grading.optionalNote')}</label>
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t('grading.notePlaceholder')}
            rows={2}
            className="px-3 py-2 rounded-lg bg-[var(--surface)] text-primary text-sm font-sans outline-none transition-[border-color] duration-150 ease-in-out border resize-y"
            style={{ borderColor: 'var(--border)' }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
          />
        </div>
      </div>
    </div>
  )
}
