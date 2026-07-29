import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineAcademicCap,
  HiOutlineArrowLeft,
  HiOutlineClipboardDocumentCheck,
  HiOutlineChevronRight,
  HiOutlineDocumentText,
  HiOutlineMagnifyingGlass,
  HiOutlineQuestionMarkCircle,
  HiOutlineRectangleStack,
  HiOutlineSquares2X2,
} from 'react-icons/hi2'
import useAuthStore, { selectUserPermissions } from '../../../../infra/auth/useAuthStore'
import { canAccess } from '../../../../infra/shared/utils/menuUtils'
import {
  ensureInstanceEvaluation,
  listEvaluationForms,
  listEvaluationLessons,
  listLessonQuizzes,
  markEvaluationComplete,
  unmarkEvaluationComplete,
} from './course-selection-evaluation-api'
import type { EvaluationLesson } from './course-selection-evaluation-api'
import { useCourseSelectionEvaluationStore } from './course-selection-evaluation-store'
import ModifiedBadge from '../../_shared/ModifiedBadge'
import Breadcrumb, { courseCategoryCrumbs } from '../../_shared/Breadcrumb'
import useFullBleedStore from "../../../../infra/shared/store/useFullBleedStore.ts";

function lessonTitle(lesson: EvaluationLesson): string {
  return lesson.lesson_title || `Lesson ${lesson.order_index + 1}`
}

export default function CourseSelectionEvaluationPage() {
  const { id } = useParams<{ id: string }>()
  const courseId = Number(id)
  const navigate = useNavigate()
  const detailPath = `/course-management/course-selection/${courseId}`
  const listPath = '/course-management/course-selection'

  const permissions = useAuthStore(selectUserPermissions)
  const hasWrite = canAccess({ permissions: ['evaluation:write'] }, permissions)

  const {
    evaluationId,
    status,
    courseMasterCompletion,
    courseTitle,
    courseModified,
    lessons,
    loading,
    setEvaluation,
    setStatus,
    setLessons,
    setLoading,
    reset,
  } = useCourseSelectionEvaluationStore(
    useShallow((s) => ({
      evaluationId: s.evaluationId,
      status: s.status,
      courseMasterCompletion: s.courseMasterCompletion,
      courseTitle: s.courseTitle,
      courseModified: s.courseModified,
      lessons: s.lessons,
      loading: s.loading,
      setEvaluation: s.setEvaluation,
      setStatus: s.setStatus,
      setLessons: s.setLessons,
      setLoading: s.setLoading,
      reset: s.reset,
    })),
  )

  const [courseQuizCount, setCourseQuizCount] = useState(0)
  const [courseFormCount, setCourseFormCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [togglingStatus, setTogglingStatus] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // Once the course master is approved, completed categories are locked.
  const [courseApproved, setCourseApproved] = useState(false)

  const filteredLessons = lessons.filter((lesson) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const title = lessonTitle(lesson).toLowerCase()
    const number = (lesson.lesson_number || '').toLowerCase()
    return title.includes(query) || number.includes(query)
  })

  // Reset store when leaving so a different course master starts fresh
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // Resolve (or create) the evaluation for this course master
  useEffect(() => {
    if (!Number.isFinite(courseId)) {
      setError('Invalid course master id')
      setBootstrapping(false)
      return
    }
    let cancelled = false
    setBootstrapping(true)
    ensureInstanceEvaluation(courseId)
      .then((data) => {
        if (cancelled) return
        setEvaluation(data.id, data.status, data.evaluation_completion, data.title, !!data.course_modified)
        setCourseApproved(data.course_status === 'approved')
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
  }, [courseId, setEvaluation])

  const refresh = useCallback(async () => {
    if (!evaluationId) return
    setLoading(true)
    try {
      // Lessons are the primary content — load them on their own so a failure
      // fetching the course-level count can never hide the lesson list.
      const res = await listEvaluationLessons(evaluationId)
      setLessons(res.items)

      // Course-level quiz and form counts are best-effort.
      const [courseQuizzes, courseForms] = await Promise.all([
        listLessonQuizzes(evaluationId, null).catch(() => null),
        listEvaluationForms(evaluationId, null).catch(() => null),
      ])
      setCourseQuizCount(courseQuizzes ? courseQuizzes.total : 0)
      setCourseFormCount(courseForms ? courseForms.total : 0)
    } finally {
      setLoading(false)
    }
  }, [evaluationId, setLessons, setLoading])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  const handleToggleStatus = async () => {
    if (!evaluationId || togglingStatus) return
    setTogglingStatus(true)
    try {
      const resp = status === 'complete'
        ? await unmarkEvaluationComplete(evaluationId)
        : await markEvaluationComplete(evaluationId)
      setStatus(resp.status, resp.evaluation_completion)
    } finally {
      setTogglingStatus(false)
    }
  }

  const openCourse = () => {
    navigate(`${detailPath}/category/evaluation/course`)
  }
  const openLesson = (lesson: EvaluationLesson) => {
    navigate(`${detailPath}/category/evaluation/lesson/${lesson.id}`, { state: { lesson } })
  }

  if (bootstrapping) {
    return <div className="p-6 text-sm text-muted">Loading evaluation…</div>
  }

  if (error || !evaluationId) {
    return (
      <div className="px-6 py-4">
        <button
          onClick={() => navigate(detailPath)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          Back to Course Selection
        </button>
        <div className="text-sm text-red-500">{error ?? 'Evaluation not found'}</div>
      </div>
    )
  }

  const isComplete = status === 'complete'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <Breadcrumb
          className="mb-2"
          items={courseCategoryCrumbs({
            scopeLabel: 'Course Selection',
            listPath,
            courseTitle,
            detailPath,
            categoryLabel: 'Evaluation',
          })}
        />
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(detailPath)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0"
          >
            <HiOutlineArrowLeft className="text-[14px]" />
            Back
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em]">
            <HiOutlineClipboardDocumentCheck className="text-[11px]" />
            Evaluation
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-muted tracking-[0.06em] uppercase">Status</span>
          <span
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
            style={{
              background: isComplete ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.12)',
              color: isComplete ? '#16A34A' : '#D97706',
            }}
          >
            {isComplete ? 'complete' : 'incomplete'}
          </span>
          <span className="text-[11px] font-bold text-muted ml-2">{courseMasterCompletion}%</span>
        </div>
        </div>
      </div>

      {/* Status banner with Mark / Unmark button */}
      {hasWrite && (
        <div
          className="flex items-center justify-between gap-3 px-6 py-3 border-b border-[var(--border)]"
          style={{ background: isComplete ? 'rgba(34,197,94,0.06)' : 'var(--surface-2)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: isComplete ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                color: isComplete ? '#16A34A' : '#D97706',
              }}
            >
              {isComplete ? 'Completed' : 'In progress'}
            </span>
            <span className="text-[12.5px] text-muted">
              {isComplete
                ? courseApproved
                  ? 'Course is approved. This category is locked and cannot be unmarked.'
                  : 'Evaluation category is marked complete. Unmark to make changes.'
                : 'Open a lesson to assign its quizzes, then mark this category complete.'}
            </span>
          </div>
          {!(isComplete && courseApproved) && (
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={togglingStatus}
              className="px-3 py-1.5 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-semibold cursor-pointer hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
            >
              {togglingStatus ? '…' : isComplete ? 'Unmark Complete' : 'Mark Complete'}
            </button>
          )}
        </div>
      )}

      {/* Section heading */}
      <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <HiOutlineSquares2X2 className="text-[15px] text-accent shrink-0" />
          <span className="text-[13px] font-bold text-primary">Course & Lessons</span>
          <span className="text-[11.5px] text-muted truncate">
            Open the course or a lesson to assign its quizzes.
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${detailPath}/category/evaluation/all`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer shrink-0"
        >
          <HiOutlineRectangleStack className="text-[14px]" />
          View all
        </button>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-[var(--border)]">
        <div className="relative">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search lessons by number or title…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-[12px] rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-muted outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar-light px-6 py-6">
        <div className="flex flex-col gap-3">
          {/* Pinned course card (always on top) */}
          <div
            onDoubleClick={openCourse}
            className="card px-5 py-4 flex items-center gap-4 cursor-pointer select-none"
            style={{ borderColor: 'var(--accent)' }}
          >
            <div
              className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <HiOutlineAcademicCap className="text-[20px]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold text-primary truncate">
                  {courseTitle || 'Course'}
                </h3>
                <span className="px-1.5 py-0.5 rounded-full bg-accent-light text-accent text-[9.5px] font-bold tracking-[0.06em] uppercase shrink-0">
                  Course
                </span>
                {courseModified && <ModifiedBadge />}
              </div>
              <p className="text-[11.5px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <HiOutlineQuestionMarkCircle className="text-[13px]" />
                  {courseQuizCount} {courseQuizCount === 1 ? 'quiz' : 'quizzes'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <HiOutlineDocumentText className="text-[13px]" />
                  {courseFormCount} {courseFormCount === 1 ? 'form' : 'forms'}
                </span>
                <span>· whole course</span>
              </p>
            </div>
            <button
              type="button"
              onClick={openCourse}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline shrink-0 bg-transparent border-none p-0 cursor-pointer"
            >
              Open
              <HiOutlineChevronRight className="text-[14px]" />
            </button>
          </div>

          {/* Lessons */}
          {loading && lessons.length === 0 ? (
            <p className="text-[12.5px] text-muted py-8 text-center">Loading…</p>
          ) : lessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-[13px] font-semibold text-primary mb-1">No lessons yet</p>
              <p className="text-[12.5px] text-muted mb-4 max-w-md">
                You can still assign quizzes to the whole course above. Lessons come from this
                course&rsquo;s master template (Course Information → Lesson Creation).
              </p>
              <button
                type="button"
                onClick={() => navigate(detailPath)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-white text-[12px] font-semibold cursor-pointer"
                style={{ background: 'var(--accent)' }}
              >
                Back to course →
              </button>
            </div>
          ) : filteredLessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-[13px] font-semibold text-primary mb-1">No lessons match &ldquo;{searchQuery}&rdquo;</p>
              <p className="text-[12.5px] text-muted">Try a different search term.</p>
            </div>
          ) : (
            filteredLessons.map((lesson) => (
              <div
                key={lesson.id}
                onDoubleClick={() => openLesson(lesson)}
                className="card px-5 py-4 flex items-center gap-4 cursor-pointer select-none"
              >
                <div
                  className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                >
                  <HiOutlineClipboardDocumentCheck className="text-[20px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-primary truncate inline-flex items-center gap-2">
                    <span className="truncate">
                      {lesson.lesson_number ? `${lesson.lesson_number} · ` : ''}
                      {lessonTitle(lesson)}
                    </span>
                    {lesson.modified && <ModifiedBadge />}
                  </h3>
                  <p className="text-[11.5px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <HiOutlineQuestionMarkCircle className="text-[13px]" />
                      {lesson.quiz_count} {lesson.quiz_count === 1 ? 'quiz' : 'quizzes'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HiOutlineDocumentText className="text-[13px]" />
                      {lesson.form_count} {lesson.form_count === 1 ? 'form' : 'forms'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openLesson(lesson)}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline shrink-0 bg-transparent border-none p-0 cursor-pointer"
                >
                  Open
                  <HiOutlineChevronRight className="text-[14px]" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
