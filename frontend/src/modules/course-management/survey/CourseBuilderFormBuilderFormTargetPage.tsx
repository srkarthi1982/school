import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineArrowLeft,
  HiOutlineDocumentText,
  HiOutlineExclamationCircle,
  HiOutlinePlus,
  HiOutlineAcademicCap,
  HiOutlineTrash,
} from 'react-icons/hi2'
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore'
import { canAccess } from '../../../infra/shared/utils/menuUtils'
import {
  associateForm,
  dissociateForm,
  ensureCourseMasterFormBuilder,
  listFormBuilderLessons,
  listFormLinks,
  listForms,
} from './form-builder-api'
import type { FormBuilderForm, FormBuilderLesson, FormOption } from './form-builder-api'
import { useFormBuilderStore } from './form-builder-store'
import useFullBleedStore from "../../../infra/shared/store/useFullBleedStore.ts";

const FORM_PAGE = '/grading-attendance/formnew'

function lessonLabel(lesson: FormBuilderLesson | null): string {
  if (!lesson) return 'Lesson'
  const parts = [lesson.lesson_number, lesson.lesson_title].filter(Boolean)
  return parts.length ? parts.join(' · ') : `Lesson ${lesson.order_index + 1}`
}

export default function CourseBuilderFormBuilderFormTargetPage() {
  const { id, lessonId: lessonIdParam } = useParams<{ id: string; lessonId?: string }>()
  const masterId = Number(id)
  const isCourse = lessonIdParam === undefined
  const lessonId: number | null = isCourse ? null : Number(lessonIdParam)
  const navigate = useNavigate()
  const location = useLocation()
  const formBuilderPath = `/course-management/course-builder/${masterId}/category/surveys`

  const permissions = useAuthStore(selectUserPermissions)
  const hasWrite = canAccess({ permissions: ['form_builder:write'] }, permissions)
  const hasDelete = canAccess({ permissions: ['form_builder:delete'] }, permissions)

  const {
    formBuilderId,
    status,
    courseTitle,
    associatedForms,
    availableForms,
    loading,
    setFormBuilder,
    setCurrentLessonId,
    setAssociatedForms,
    setAvailableForms,
    addFormAssociation,
    removeFormAssociation,
    setLoading,
    reset,
  } = useFormBuilderStore(
    useShallow((s) => ({
      formBuilderId: s.formBuilderId,
      status: s.status,
      courseTitle: s.courseTitle,
      associatedForms: s.associatedForms,
      availableForms: s.availableForms,
      loading: s.loading,
      setFormBuilder: s.setFormBuilder,
      setCurrentLessonId: s.setCurrentLessonId,
      setAssociatedForms: s.setAssociatedForms,
      setAvailableForms: s.setAvailableForms,
      addFormAssociation: s.addFormAssociation,
      removeFormAssociation: s.removeFormAssociation,
      setLoading: s.setLoading,
      reset: s.reset,
    })),
  )

  const lessonFromState = (location.state as { lesson?: FormBuilderLesson } | null)?.lesson ?? null
  const [lesson, setLesson] = useState<FormBuilderLesson | null>(lessonFromState)
  const [error, setError] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [associating, setAssociating] = useState<number | null>(null)
  const [removeTarget, setRemoveTarget] = useState<FormBuilderForm | null>(null)

  // Reset store when leaving so a different target/master starts fresh
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // Resolve (or create) the Form Builder for this course master, scoped to the target
  useEffect(() => {
    if (!Number.isFinite(masterId) || (!isCourse && !Number.isFinite(lessonId))) {
      setError('Invalid course or lesson id')
      setBootstrapping(false)
      return
    }
    let cancelled = false
    setBootstrapping(true)
    setCurrentLessonId(lessonId)
    ensureCourseMasterFormBuilder(masterId)
      .then(async (data) => {
        if (cancelled) return
        setFormBuilder(data.id, data.status, data.course_master_completion, data.title)
        if (!isCourse && !lessonFromState) {
          const res = await listFormBuilderLessons(data.id)
          if (cancelled) return
          setLesson(res.items.find((l) => l.id === lessonId) ?? null)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Failed to load Form Builder')
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false)
      })
    return () => {
      cancelled = true
    }
  }, [masterId, lessonId, isCourse, lessonFromState, setFormBuilder, setCurrentLessonId])

  const refresh = useCallback(async () => {
    if (!formBuilderId) return
    setLoading(true)
    try {
      const [linkRes, formRes] = await Promise.all([
        listFormLinks(formBuilderId, lessonId),
        listForms(),
      ])
      setAssociatedForms(linkRes.items)
      setAvailableForms(formRes)
    } finally {
      setLoading(false)
    }
  }, [formBuilderId, lessonId, setAssociatedForms, setAvailableForms, setLoading])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  // Forms not yet associated with this target.
  const pickableForms = useMemo(() => {
    const taken = new Set(associatedForms.map((f) => f.form_id))
    return availableForms.filter((f) => !taken.has(f.id))
  }, [availableForms, associatedForms])

  const handleAssociate = async (form: FormOption) => {
    if (!formBuilderId || associating) return
    setAssociating(form.id)
    try {
      const created = await associateForm(formBuilderId, lessonId, form.id)
      addFormAssociation(created)
    } finally {
      setAssociating(null)
    }
  }

  const confirmRemove = async () => {
    if (!removeTarget) return
    try {
      await dissociateForm(removeTarget.id)
      removeFormAssociation(removeTarget.id)
    } finally {
      setRemoveTarget(null)
    }
  }

  if (bootstrapping) {
    return <div className="p-6 text-sm text-muted">Loading forms…</div>
  }

  if (error || !formBuilderId) {
    return (
      <div className="px-6 py-4">
        <button
          onClick={() => navigate(formBuilderPath)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          Back to Form Builder
        </button>
        <div className="text-sm text-red-500">{error ?? 'Form Builder not found'}</div>
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
            onClick={() => navigate(formBuilderPath)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0 shrink-0"
          >
            <HiOutlineArrowLeft className="text-[14px]" />
            Form Builder
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em] shrink-0">
            {isCourse ? (
              <HiOutlineAcademicCap className="text-[11px]" />
            ) : (
              <HiOutlineDocumentText className="text-[11px]" />
            )}
            {isCourse ? 'Course' : 'Lesson'}
          </div>
          <span className="text-[13px] font-bold text-primary truncate">{targetLabel}</span>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 shrink-0">
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
              onClick={() => setShowPicker(true)}
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
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[var(--border)]">
        <HiOutlineDocumentText className="text-[15px] text-accent" />
        <span className="text-[13px] font-bold text-primary">Associated forms</span>
        <span className="text-[11.5px] text-muted">
          {associatedForms.length} {associatedForms.length === 1 ? 'form' : 'forms'}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar-light px-6 py-6">
        {loading && associatedForms.length === 0 ? (
          <p className="text-[12.5px] text-muted py-8 text-center">Loading…</p>
        ) : associatedForms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-4"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <HiOutlineDocumentText className="text-[24px]" />
            </div>
            <p className="text-[14px] font-semibold text-primary mb-1">No forms assigned</p>
            <p className="text-[12.5px] text-muted">
              Associate an existing form with {isCourse ? 'this course' : 'this lesson'}, or create a
              new one in the Form workspace.
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
                    {form.question_count}{' '}
                    {form.question_count === 1 ? 'question' : 'questions'} · {form.status}
                  </p>
                </div>
                {hasDelete && !isComplete && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(form)}
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

      {/* Form picker modal */}
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
                        disabled={associating !== null}
                        onClick={() => handleAssociate(form)}
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
                        {associating === form.id ? (
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
                onClick={() => setShowPicker(false)}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary bg-transparent border border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Done
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
                <p className="text-base font-bold text-primary">Remove form</p>
                <p className="text-sm text-secondary mt-1">
                  Remove "{removeTarget.title}" from {isCourse ? 'this course' : 'this lesson'}? The
                  form itself stays in the Form workspace.
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
    </div>
  )
}
