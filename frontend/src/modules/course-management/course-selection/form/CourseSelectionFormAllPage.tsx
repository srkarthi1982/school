import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  HiOutlineArrowLeft,
  HiOutlineBookOpen,
  HiOutlineChevronRight,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentText,
  HiOutlineMagnifyingGlass,
  HiOutlineRectangleStack,
} from 'react-icons/hi2'
import {
  ensureInstanceFormBuilder,
  listAllFormLinks,
  listAllSurveyLinks,
  listFormBuilderLessons,
} from './course-selection-form-api'
import type {
  FormBuilderForm,
  FormBuilderLesson,
  FormBuilderSurvey,
} from './course-selection-form-api'
import Breadcrumb, { courseCategoryCrumbs } from '../../_shared/Breadcrumb'

type Tab = 'form' | 'survey'

// A form or survey, de-duplicated across its lesson/course associations.
interface AllItem {
  kind: Tab
  refId: number // survey_id or form_id (the underlying form/survey, not the link)
  title: string
  status: string
  questionCount: number
  associations: { linkId: number; lessonId: number | null }[]
}

function lessonLabelFor(lessonId: number | null, lessonMap: Map<number, string>): string {
  if (lessonId == null) return 'Whole course'
  return lessonMap.get(lessonId) ?? 'Lesson'
}

export default function CourseSelectionFormAllPage() {
  const { id } = useParams<{ id: string }>()
  const courseId = Number(id)
  const navigate = useNavigate()
  const detailPath = `/course-management/course-selection/${courseId}`
  const listPath = '/course-management/course-selection'
  const formPath = `${detailPath}/category/surveys`

  const [tab, setTab] = useState<Tab>('form')
  const [courseTitle, setCourseTitle] = useState('')
  const [lessons, setLessons] = useState<FormBuilderLesson[]>([])
  const [surveys, setSurveys] = useState<FormBuilderSurvey[]>([])
  const [forms, setForms] = useState<FormBuilderForm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const load = useCallback(async () => {
    if (!Number.isFinite(courseId)) {
      setError('Invalid course id')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const fb = await ensureInstanceFormBuilder(courseId)
      setCourseTitle(fb.title)
      const [lessonRes, surveyRes, formRes] = await Promise.all([
        listFormBuilderLessons(fb.id),
        listAllSurveyLinks(fb.id),
        listAllFormLinks(fb.id),
      ])
      setLessons(lessonRes.items)
      setSurveys(surveyRes.items)
      setForms(formRes.items)
    } catch (e) {
      setError((e as Error).message || 'Failed to load forms')
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    load()
  }, [load])

  const lessonMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const l of lessons) {
      const parts = [l.lesson_number, l.lesson_title].filter(Boolean)
      map.set(l.id, parts.length ? parts.join(' · ') : `Lesson ${l.order_index + 1}`)
    }
    return map
  }, [lessons])

  const items: AllItem[] = useMemo(() => {
    // De-duplicate by the underlying form/survey so a single one linked to
    // multiple lessons shows once, with all its associations collected.
    const byRef = new Map<number, AllItem>()
    const add = (refId: number, it: FormBuilderSurvey | FormBuilderForm) => {
      const existing = byRef.get(refId)
      if (existing) {
        existing.associations.push({ linkId: it.id, lessonId: it.lesson_id })
        return
      }
      byRef.set(refId, {
        kind: tab,
        refId,
        title: it.title,
        status: it.status,
        questionCount: it.question_count,
        associations: [{ linkId: it.id, lessonId: it.lesson_id }],
      })
    }
    if (tab === 'survey') {
      for (const s of surveys) add(s.survey_id, s)
    } else {
      for (const f of forms) add(f.form_id, f)
    }
    return Array.from(byRef.values())
  }, [tab, surveys, forms])

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return items
    return items.filter(
      (it) =>
        it.title.toLowerCase().includes(query) ||
        it.associations.some((a) =>
          lessonLabelFor(a.lessonId, lessonMap).toLowerCase().includes(query),
        ),
    )
  }, [items, searchQuery, lessonMap])

  const distinctFormCount = useMemo(
    () => new Set(forms.map((f) => f.form_id)).size,
    [forms],
  )
  const distinctSurveyCount = useMemo(
    () => new Set(surveys.map((s) => s.survey_id)).size,
    [surveys],
  )

  const openTarget = (kind: Tab, lessonId: number | null) => {
    const target = lessonId == null ? 'course' : `lesson/${lessonId}`
    navigate(`${formPath}/${kind}/${target}`)
  }

  const kindLabel = tab === 'survey' ? 'survey' : 'form'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <Breadcrumb
          className="mb-2"
          items={[
            ...courseCategoryCrumbs({
              scopeLabel: 'Course Selection',
              listPath,
              courseTitle,
              detailPath,
              categoryLabel: 'Form Builder',
            }),
            { label: `All ${kindLabel}s` },
          ]}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(formPath)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0"
            >
              <HiOutlineArrowLeft className="text-[14px]" />
              Course & Lessons
            </button>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em]">
              <HiOutlineRectangleStack className="text-[11px]" />
              All associations
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-[var(--border)]">
        <TabButton
          active={tab === 'form'}
          onClick={() => setTab('form')}
          icon={<HiOutlineDocumentText className="text-[14px]" />}
          label={`Forms (${distinctFormCount})`}
        />
        <TabButton
          active={tab === 'survey'}
          onClick={() => setTab('survey')}
          icon={<HiOutlineClipboardDocumentList className="text-[14px]" />}
          label={`Surveys (${distinctSurveyCount})`}
        />
      </div>

      {/* Section heading */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[var(--border)]">
        <HiOutlineRectangleStack className="text-[15px] text-accent" />
        <span className="text-[13px] font-bold text-primary capitalize">{kindLabel}s</span>
        <span className="text-[11.5px] text-muted">
          Every associated {kindLabel} across the course and its lessons.
        </span>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-[var(--border)]">
        <div className="relative">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted pointer-events-none" />
          <input
            type="text"
            placeholder={`Search ${kindLabel}s by title or lesson…`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-[12px] rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-muted outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar-light px-6 py-6">
        {loading ? (
          <p className="text-[12.5px] text-muted py-8 text-center">Loading…</p>
        ) : error ? (
          <div className="text-sm text-red-500 py-8 text-center">{error}</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-4"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <HiOutlineRectangleStack className="text-[24px]" />
            </div>
            <p className="text-[14px] font-semibold text-primary mb-1">No {kindLabel}s yet</p>
            <p className="text-[12.5px] text-muted mb-4 max-w-md">
              No {kindLabel}s have been associated with this course or its lessons yet. Open the
              course or a lesson to associate {kindLabel}s.
            </p>
            <button
              type="button"
              onClick={() => navigate(formPath)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-white text-[12px] font-semibold cursor-pointer"
              style={{ background: 'var(--accent)' }}
            >
              Go to Course & Lessons →
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[13px] font-semibold text-primary mb-1">
              No {kindLabel}s match &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-[12.5px] text-muted">Try a different search term.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map((it) => (
              <div
                key={`${it.kind}-${it.refId}`}
                className="card px-5 py-4 flex items-start gap-4"
              >
                <div
                  className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                >
                  {it.kind === 'survey' ? (
                    <HiOutlineClipboardDocumentList className="text-[20px]" />
                  ) : (
                    <HiOutlineDocumentText className="text-[20px]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-primary truncate">
                    {it.title || `Untitled ${kindLabel}`}
                  </h3>
                  <span className="text-[11.5px] text-muted">
                    {it.questionCount} {it.questionCount === 1 ? 'question' : 'questions'}
                    {it.status && ` · ${it.status}`}
                    {' · '}
                    {it.associations.length}{' '}
                    {it.associations.length === 1 ? 'association' : 'associations'}
                  </span>
                  <div className="flex items-center flex-wrap gap-1.5 mt-2">
                    {it.associations.map((a) => (
                      <button
                        key={a.linkId}
                        type="button"
                        onClick={() => openTarget(it.kind, a.lessonId)}
                        title="Open this association"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-light text-accent text-[10.5px] font-semibold hover:opacity-80 transition-opacity border-none cursor-pointer"
                      >
                        <HiOutlineBookOpen className="text-[11px]" />
                        {lessonLabelFor(a.lessonId, lessonMap)}
                        <HiOutlineChevronRight className="text-[11px]" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold border-b-2 -mb-px transition-colors cursor-pointer bg-transparent ${
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-muted hover:text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
