import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineAcademicCap,
  HiOutlineArrowLeft,
  HiOutlineClipboardDocumentCheck,
  HiOutlineDocumentText,
  HiOutlineExclamationCircle,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineQuestionMarkCircle,
  HiOutlineTrash,
} from 'react-icons/hi2'
import useAuthStore, { selectUserPermissions } from '../../../../infra/auth/useAuthStore'
import { canAccess } from '../../../../infra/shared/utils/menuUtils'
import {
  associateForm,
  associateQuiz,
  dissociateForm,
  dissociateQuiz,
  ensureInstanceEvaluation,
  listApprovedQuizzes,
  listEvaluationForms,
  listEvaluationLessons,
  listForms,
  listLessonQuizzes,
  updateQuizAssociation,
} from './course-selection-evaluation-api'
import type {
  AssessmentType,
  EvaluationForm,
  EvaluationLesson,
  EvaluationQuiz,
  FormOption,
  QuizOption,
} from './course-selection-evaluation-api'
import { useCourseSelectionEvaluationStore } from './course-selection-evaluation-store'
import useFullBleedStore from "../../../../infra/shared/store/useFullBleedStore.ts";

// Form workspace route used by the "Create new form" affordance.
const FORM_PAGE = '/grading-attendance/formnew'

function lessonLabel(lesson: EvaluationLesson | null): string {
  if (!lesson) return 'Lesson'
  const parts = [lesson.lesson_number, lesson.lesson_title].filter(Boolean)
  return parts.length ? parts.join(' · ') : `Lesson ${lesson.order_index + 1}`
}

interface AssessmentForm {
  assessmentType: AssessmentType
  maxMark: string
  passMark: string
  passPercentage: string
  percentageAllocation: string
}

const EMPTY_FORM: AssessmentForm = {
  assessmentType: 'theory',
  maxMark: '',
  passMark: '',
  passPercentage: '',
  percentageAllocation: '',
}

export default function CourseSelectionEvaluationLessonPage() {
  const { id, lessonId: lessonIdParam } = useParams<{ id: string; lessonId?: string }>()
  const courseId = Number(id)
  const isCourse = lessonIdParam === undefined
  const lessonId: number | null = isCourse ? null : Number(lessonIdParam)
  const navigate = useNavigate()
  const location = useLocation()
  const evaluationPath = `/course-management/course-selection/${courseId}/category/evaluation`

  const permissions = useAuthStore(selectUserPermissions)
  const hasWrite = canAccess({ permissions: ['evaluation:write'] }, permissions)
  const hasDelete = canAccess({ permissions: ['evaluation:delete'] }, permissions)

  const {
    evaluationId,
    status,
    courseTitle,
    associatedQuizzes,
    availableQuizzes,
    associatedForms,
    availableForms,
    loading,
    setEvaluation,
    setCurrentLessonId,
    setAssociatedQuizzes,
    setAvailableQuizzes,
    addAssociation,
    updateAssociation,
    removeAssociation,
    setAssociatedForms,
    setAvailableForms,
    addFormAssociation,
    removeFormAssociation,
    setLoading,
    reset,
  } = useCourseSelectionEvaluationStore(
    useShallow((s) => ({
      evaluationId: s.evaluationId,
      status: s.status,
      courseTitle: s.courseTitle,
      associatedQuizzes: s.associatedQuizzes,
      availableQuizzes: s.availableQuizzes,
      associatedForms: s.associatedForms,
      availableForms: s.availableForms,
      loading: s.loading,
      setEvaluation: s.setEvaluation,
      setCurrentLessonId: s.setCurrentLessonId,
      setAssociatedQuizzes: s.setAssociatedQuizzes,
      setAvailableQuizzes: s.setAvailableQuizzes,
      addAssociation: s.addAssociation,
      updateAssociation: s.updateAssociation,
      removeAssociation: s.removeAssociation,
      setAssociatedForms: s.setAssociatedForms,
      setAvailableForms: s.setAvailableForms,
      addFormAssociation: s.addFormAssociation,
      removeFormAssociation: s.removeFormAssociation,
      setLoading: s.setLoading,
      reset: s.reset,
    })),
  )

  const lessonFromState = (location.state as { lesson?: EvaluationLesson } | null)?.lesson ?? null
  const [lesson, setLesson] = useState<EvaluationLesson | null>(lessonFromState)
  const [error, setError] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  // The quiz selected from the picker that we're now configuring before it is
  // associated. Setting this opens the assessment-details form.
  const [detailsFor, setDetailsFor] = useState<QuizOption | null>(null)
  // An existing association being edited. Setting this opens the same form
  // pre-filled. Only one of detailsFor / editing is set at a time.
  const [editing, setEditing] = useState<EvaluationQuiz | null>(null)
  const [form, setForm] = useState<AssessmentForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<EvaluationQuiz | null>(null)
  // Form association: picker visibility, the form currently being associated,
  // and the form pending removal.
  const [showFormPicker, setShowFormPicker] = useState(false)
  const [associatingForm, setAssociatingForm] = useState<number | null>(null)
  const [removeFormTarget, setRemoveFormTarget] = useState<EvaluationForm | null>(null)

  // Reset store when leaving so a different lesson/master starts fresh
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // Resolve (or create) the evaluation for this course master, scoped to the target
  useEffect(() => {
    if (!Number.isFinite(courseId) || (!isCourse && !Number.isFinite(lessonId))) {
      setError('Invalid course or lesson id')
      setBootstrapping(false)
      return
    }
    let cancelled = false
    setBootstrapping(true)
    setCurrentLessonId(lessonId)
    ensureInstanceEvaluation(courseId)
      .then(async (data) => {
        if (cancelled) return
        setEvaluation(data.id, data.status, data.evaluation_completion, data.title)
        if (!isCourse && !lessonFromState) {
          const res = await listEvaluationLessons(data.id)
          if (cancelled) return
          setLesson(res.items.find((l) => l.id === lessonId) ?? null)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Failed to load evaluation')
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId, lessonId, isCourse, lessonFromState, setEvaluation, setCurrentLessonId])

  const refresh = useCallback(async () => {
    if (!evaluationId) return
    setLoading(true)
    try {
      // Load each list independently — one picker source failing must not hide
      // the others (associations vs. available quizzes/forms).
      const [assocRes, quizRes, formAssocRes, formRes] = await Promise.allSettled([
        listLessonQuizzes(evaluationId, lessonId),
        listApprovedQuizzes(),
        listEvaluationForms(evaluationId, lessonId),
        listForms(),
      ])
      if (assocRes.status === 'fulfilled') setAssociatedQuizzes(assocRes.value.items)
      if (quizRes.status === 'fulfilled') setAvailableQuizzes(quizRes.value)
      if (formAssocRes.status === 'fulfilled') setAssociatedForms(formAssocRes.value.items)
      if (formRes.status === 'fulfilled') setAvailableForms(formRes.value)
    } finally {
      setLoading(false)
    }
  }, [
    evaluationId,
    lessonId,
    setAssociatedQuizzes,
    setAvailableQuizzes,
    setAssociatedForms,
    setAvailableForms,
    setLoading,
  ])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  // Approved quizzes not yet associated with this lesson.
  const pickableQuizzes = useMemo(() => {
    const taken = new Set(associatedQuizzes.map((q) => q.quiz_id))
    return availableQuizzes.filter((q) => !taken.has(q.id))
  }, [availableQuizzes, associatedQuizzes])

  // Forms not yet associated with this target.
  const pickableForms = useMemo(() => {
    const taken = new Set(associatedForms.map((f) => f.form_id))
    return availableForms.filter((f) => !taken.has(f.id))
  }, [availableForms, associatedForms])

  // Combined percentage allocation across all quizzes here — must reach but not
  // exceed 100%.
  const allocatedTotal = useMemo(
    () => associatedQuizzes.reduce((sum, q) => sum + (q.percentage_allocation || 0), 0),
    [associatedQuizzes],
  )
  const remainingAllocation = Math.max(0, 100 - allocatedTotal)

  // While the form is open, how much is allocated to *other* quizzes (excluding
  // the one being edited) and how much is therefore available to this one.
  const otherAllocated = editing ? allocatedTotal - (editing.percentage_allocation || 0) : allocatedTotal
  const formAvailable = Math.max(0, 100 - otherAllocated)

  const openDetails = (quiz: QuizOption) => {
    setEditing(null)
    setDetailsFor(quiz)
    setForm({ ...EMPTY_FORM, percentageAllocation: remainingAllocation ? String(remainingAllocation) : '' })
    setFormError(null)
    setShowPicker(false)
  }

  const openEdit = (quiz: EvaluationQuiz) => {
    setDetailsFor(null)
    setEditing(quiz)
    setForm({
      assessmentType: quiz.assessment_type ?? 'theory',
      maxMark: String(quiz.max_mark),
      passMark: String(quiz.pass_mark),
      passPercentage: String(quiz.pass_percentage),
      percentageAllocation: String(quiz.percentage_allocation),
    })
    setFormError(null)
    setShowPicker(false)
  }

  const closeForm = () => {
    setDetailsFor(null)
    setEditing(null)
  }

  const handleSubmitDetails = async () => {
    if (!evaluationId || submitting || (!detailsFor && !editing)) return

    const maxMark = Number(form.maxMark)
    const passMark = Number(form.passMark)
    const passPercentage = Number(form.passPercentage)
    const percentageAllocation = Number(form.percentageAllocation)

    const allNumbers = [maxMark, passMark, passPercentage, percentageAllocation]
    if (allNumbers.some((n) => !Number.isFinite(n) || n < 0)) {
      setFormError('Please enter valid, non-negative numbers for all fields.')
      return
    }
    if (passMark > maxMark) {
      setFormError('Pass mark cannot exceed max mark.')
      return
    }
    if (passPercentage > 100) {
      setFormError('Pass percentage cannot exceed 100%.')
      return
    }
    if (percentageAllocation > formAvailable) {
      setFormError(
        `Percentage allocation cannot exceed the available ${formAvailable}% ` +
          `(${otherAllocated}% allocated to other quizzes).`,
      )
      return
    }

    const input = {
      assessmentType: form.assessmentType,
      maxMark,
      passMark,
      passPercentage,
      percentageAllocation,
    }

    setFormError(null)
    setSubmitting(true)
    try {
      if (editing) {
        const updated = await updateQuizAssociation(editing.id, input)
        updateAssociation(updated)
      } else if (detailsFor) {
        const created = await associateQuiz(evaluationId, lessonId, detailsFor.id, input)
        addAssociation(created)
      }
      closeForm()
    } catch (e) {
      setFormError((e as Error).message || 'Failed to save assessment details')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmRemove = async () => {
    if (!removeTarget) return
    try {
      await dissociateQuiz(removeTarget.id)
      removeAssociation(removeTarget.id)
    } finally {
      setRemoveTarget(null)
    }
  }

  const handleAssociateForm = async (form: FormOption) => {
    if (!evaluationId || associatingForm) return
    setAssociatingForm(form.id)
    try {
      const created = await associateForm(evaluationId, lessonId, form.id)
      addFormAssociation(created)
    } finally {
      setAssociatingForm(null)
    }
  }

  const confirmRemoveForm = async () => {
    if (!removeFormTarget) return
    try {
      await dissociateForm(removeFormTarget.id)
      removeFormAssociation(removeFormTarget.id)
    } finally {
      setRemoveFormTarget(null)
    }
  }

  if (bootstrapping) {
    return <div className="p-6 text-sm text-muted">Loading lesson evaluation…</div>
  }

  if (error || !evaluationId) {
    return (
      <div className="px-6 py-4">
        <button
          onClick={() => navigate(evaluationPath)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          Back to Lessons
        </button>
        <div className="text-sm text-red-500">{error ?? 'Evaluation not found'}</div>
      </div>
    )
  }

  const isComplete = status === 'complete'
  const canEdit = hasWrite && !isComplete
  const targetLabel = isCourse ? courseTitle || 'Course' : lessonLabel(lesson)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(evaluationPath)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0 shrink-0"
          >
            <HiOutlineArrowLeft className="text-[14px]" />
            Back
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em] shrink-0">
            {isCourse ? (
              <HiOutlineAcademicCap className="text-[11px]" />
            ) : (
              <HiOutlineClipboardDocumentCheck className="text-[11px]" />
            )}
            {isCourse ? 'Course' : 'Lesson'}
          </div>
          <span className="text-[13px] font-bold text-primary truncate">{targetLabel}</span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/assignment-assessment/quiz-bank')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <HiOutlinePlus className="text-[14px]" />
              Create new quiz
            </button>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-white text-[12px] font-semibold cursor-pointer transition-opacity"
              style={{ background: 'var(--accent)' }}
            >
              <HiOutlinePlus className="text-[14px]" />
              Associate quiz
            </button>
            <span className="w-px self-stretch bg-[var(--border)] mx-0.5" aria-hidden="true" />
            <button
              type="button"
              onClick={() => navigate(FORM_PAGE)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <HiOutlinePlus className="text-[14px]" />
              Create new form
            </button>
            <button
              type="button"
              onClick={() => setShowFormPicker(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-white text-[12px] font-semibold cursor-pointer transition-opacity"
              style={{ background: 'var(--accent)' }}
            >
              <HiOutlinePlus className="text-[14px]" />
              Associate form
            </button>
          </div>
        )}
      </div>

      {/* Section heading */}
      <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <HiOutlineQuestionMarkCircle className="text-[15px] text-accent shrink-0" />
          <span className="text-[13px] font-bold text-primary">Associated quizzes</span>
          <span className="text-[11.5px] text-muted">
            {associatedQuizzes.length} {associatedQuizzes.length === 1 ? 'quiz' : 'quizzes'}
          </span>
        </div>
        <span
          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0"
          style={{
            background: allocatedTotal === 100 ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
            color: allocatedTotal === 100 ? '#16A34A' : '#D97706',
          }}
        >
          {allocatedTotal}% allocated
        </span>
      </div>

      {/* Allocation warning */}
      {associatedQuizzes.length > 0 && allocatedTotal < 100 && (
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-[var(--border)] bg-[rgba(245,158,11,0.08)]">
          <HiOutlineExclamationCircle className="text-[15px] text-[#D97706] shrink-0" />
          <span className="text-[12px] text-[#92600C]">
            Percentage allocation is less than 100% — {remainingAllocation}% remaining to allocate
            across {isCourse ? 'this course' : 'this lesson'}.
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar-light px-6 py-6">
        {loading && associatedQuizzes.length === 0 ? (
          <p className="text-[12.5px] text-muted py-8 text-center">Loading…</p>
        ) : associatedQuizzes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-4"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <HiOutlineQuestionMarkCircle className="text-[24px]" />
            </div>
            <p className="text-[14px] font-semibold text-primary mb-1">No quizzes assigned</p>
            <p className="text-[12.5px] text-muted">
              Associate an approved quiz with {isCourse ? 'this course' : 'this lesson'}, or create a
              new one in the Quiz Bank.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {associatedQuizzes.map((quiz) => (
              <div key={quiz.id} className="card px-5 py-4 flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                >
                  <HiOutlineQuestionMarkCircle className="text-[20px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-bold text-primary truncate">{quiz.name}</h3>
                    {quiz.assessment_type && (
                      <span className="px-1.5 py-0.5 rounded-full bg-accent-light text-accent text-[9.5px] font-bold tracking-[0.06em] uppercase shrink-0">
                        {quiz.assessment_type}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-muted mt-0.5">
                    {quiz.question_count} {quiz.question_count === 1 ? 'question' : 'questions'}
                    {quiz.type ? ` · ${quiz.type.replace('_', ' ')}` : ''}
                  </p>
                  <p className="text-[11.5px] text-muted mt-0.5">
                    Max {quiz.max_mark} · Pass {quiz.pass_mark} ({quiz.pass_percentage}%) ·{' '}
                    <span className="font-semibold text-secondary">
                      {quiz.percentage_allocation}% allocation
                    </span>
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openEdit(quiz)}
                    className="shrink-0 p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
                    aria-label="Edit assessment details"
                  >
                    <HiOutlinePencilSquare className="text-[16px]" />
                  </button>
                )}
                {hasDelete && !isComplete && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(quiz)}
                    className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 transition-colors"
                    aria-label="Remove quiz"
                  >
                    <HiOutlineTrash className="text-[16px]" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Associated forms */}
        <div className="mt-8 pt-6 border-t border-[var(--border)]">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineDocumentText className="text-[15px] text-accent shrink-0" />
            <span className="text-[13px] font-bold text-primary">Associated forms</span>
            <span className="text-[11.5px] text-muted">
              {associatedForms.length} {associatedForms.length === 1 ? 'form' : 'forms'}
            </span>
          </div>

          {associatedForms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div
                className="w-12 h-12 rounded-[12px] flex items-center justify-center mb-3"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
              >
                <HiOutlineDocumentText className="text-[20px]" />
              </div>
              <p className="text-[13px] font-semibold text-primary mb-1">No forms assigned</p>
              <p className="text-[12px] text-muted">
                Associate a form with {isCourse ? 'this course' : 'this lesson'}, or create a new one
                in the Form workspace.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {associatedForms.map((form) => (
                <div key={form.id} className="card px-5 py-4 flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                  >
                    <HiOutlineDocumentText className="text-[20px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold text-primary truncate">{form.title}</h3>
                    <p className="text-[11.5px] text-muted mt-0.5">
                      {form.question_count} {form.question_count === 1 ? 'question' : 'questions'} ·{' '}
                      {form.status}
                    </p>
                  </div>
                  {hasDelete && !isComplete && (
                    <button
                      type="button"
                      onClick={() => setRemoveFormTarget(form)}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 transition-colors"
                      aria-label="Remove form"
                    >
                      <HiOutlineTrash className="text-[16px]" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quiz picker modal */}
      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowPicker(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col max-h-[80vh]"
            style={{ borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-primary">Associate a quiz</p>
                <p className="text-[12px] text-muted mt-0.5">
                  Only approved quizzes are listed. Create new ones in the Quiz Bank.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/assignment-assessment/quiz-bank')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer shrink-0"
              >
                <HiOutlinePlus className="text-[14px]" />
                New quiz
              </button>
            </div>
            <div className="flex-1 overflow-y-auto thin-scrollbar-light px-4 py-4">
              {pickableQuizzes.length === 0 ? (
                <p className="text-[12.5px] text-muted py-10 text-center">
                  No approved quizzes available to associate.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {pickableQuizzes.map((quiz) => (
                    <li key={quiz.id}>
                      <button
                        type="button"
                        onClick={() => openDetails(quiz)}
                        className="w-full text-start px-4 py-3 rounded-[10px] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[13.5px] font-bold text-primary truncate">{quiz.name}</h4>
                          <p className="text-[11.5px] text-muted mt-0.5 truncate">
                            {quiz.questions.length}{' '}
                            {quiz.questions.length === 1 ? 'question' : 'questions'} · weight{' '}
                            {quiz.weight}%
                          </p>
                        </div>
                        <HiOutlinePlus className="text-[16px] text-accent shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-6 py-3 border-t border-[var(--border)] flex justify-end">
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary bg-transparent border border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Form picker modal */}
      {showFormPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowFormPicker(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col max-h-[80vh]"
            style={{ borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-primary">Associate a form</p>
                <p className="text-[12px] text-muted mt-0.5">
                  Pick an existing form, or create a new one in the Form workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate(FORM_PAGE)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer shrink-0"
              >
                <HiOutlinePlus className="text-[14px]" />
                New form
              </button>
            </div>
            <div className="flex-1 overflow-y-auto thin-scrollbar-light px-4 py-4">
              {pickableForms.length === 0 ? (
                <p className="text-[12.5px] text-muted py-10 text-center">
                  No forms available to associate.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {pickableForms.map((form) => (
                    <li key={form.id}>
                      <button
                        type="button"
                        disabled={associatingForm !== null}
                        onClick={() => handleAssociateForm(form)}
                        className="w-full text-start px-4 py-3 rounded-[10px] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[13.5px] font-bold text-primary truncate">
                            {form.title}
                          </h4>
                          <p className="text-[11.5px] text-muted mt-0.5 truncate">
                            {form.questions.length}{' '}
                            {form.questions.length === 1 ? 'question' : 'questions'} · {form.status}
                          </p>
                        </div>
                        {associatingForm === form.id ? (
                          <span className="text-[12px] text-muted shrink-0">Adding…</span>
                        ) : (
                          <HiOutlinePlus className="text-[16px] text-accent shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-6 py-3 border-t border-[var(--border)] flex justify-end">
              <button
                type="button"
                onClick={() => setShowFormPicker(false)}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary bg-transparent border border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assessment-details form modal (create or edit) */}
      {(detailsFor || editing) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeForm}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col max-h-[85vh]"
            style={{ borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <p className="text-base font-bold text-primary">
                {editing ? 'Edit assessment details' : 'Assessment details'}
              </p>
              <p className="text-[12px] text-muted mt-0.5 truncate">
                {editing ? editing.name : detailsFor?.name}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto thin-scrollbar-light px-6 py-4 flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-secondary mb-1.5">
                  Assessment type
                </label>
                <select
                  value={form.assessmentType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, assessmentType: e.target.value as AssessmentType }))
                  }
                  className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-primary cursor-pointer"
                >
                  <option value="theory">Theory</option>
                  <option value="practical">Practical</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-secondary mb-1.5">
                    Max mark
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.maxMark}
                    onChange={(e) => setForm((f) => ({ ...f, maxMark: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-primary"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-secondary mb-1.5">
                    Pass mark
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.passMark}
                    onChange={(e) => setForm((f) => ({ ...f, passMark: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-primary"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-secondary mb-1.5">
                    Pass percentage (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.passPercentage}
                    onChange={(e) => setForm((f) => ({ ...f, passPercentage: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-primary"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-secondary mb-1.5">
                    Allocation (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={formAvailable}
                    value={form.percentageAllocation}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, percentageAllocation: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[13px] text-primary"
                  />
                </div>
              </div>

              <p className="text-[11.5px] text-muted">
                {otherAllocated}% allocated to other quizzes · {formAvailable}% available of 100%.
              </p>

              {formError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-[8px] bg-red-500/10">
                  <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-0.5 shrink-0" />
                  <span className="text-[12px] text-red-600">{formError}</span>
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-[var(--border)] flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary bg-transparent border border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitDetails}
                disabled={submitting}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer transition-opacity disabled:opacity-50 border-none"
                style={{ background: 'var(--accent)' }}
              >
                {submitting
                  ? 'Saving…'
                  : editing
                    ? 'Save changes'
                    : 'Associate quiz'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      {removeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setRemoveTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-[var(--surface)] shadow-md p-6"
            style={{ borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 rounded-full bg-red-500/10">
                <HiOutlineExclamationCircle className="text-red-500 text-xl" />
              </div>
              <div>
                <p className="text-base font-bold text-primary">Remove quiz</p>
                <p className="text-sm text-secondary mt-1">
                  Remove "{removeTarget.name}" from {isCourse ? 'this course' : 'this lesson'}? The
                  quiz itself stays in the Quiz Bank.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary bg-transparent border border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemove}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white bg-red-500 hover:opacity-90 transition-opacity border-none cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove form confirmation */}
      {removeFormTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setRemoveFormTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-[var(--surface)] shadow-md p-6"
            style={{ borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 rounded-full bg-red-500/10">
                <HiOutlineExclamationCircle className="text-red-500 text-xl" />
              </div>
              <div>
                <p className="text-base font-bold text-primary">Remove form</p>
                <p className="text-sm text-secondary mt-1">
                  Remove "{removeFormTarget.title}" from {isCourse ? 'this course' : 'this lesson'}?
                  The form itself stays in the Form workspace.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveFormTarget(null)}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary bg-transparent border border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveForm}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white bg-red-500 hover:opacity-90 transition-opacity border-none cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
