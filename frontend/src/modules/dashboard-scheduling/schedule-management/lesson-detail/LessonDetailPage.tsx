import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  HiOutlineArrowLeft,
  HiOutlineArrowDownTray,
  HiOutlineEye,
  HiOutlineArrowTopRightOnSquare,
  HiOutlinePaperAirplane,
  HiOutlineBookOpen,
  HiOutlineClipboardDocumentList,
  HiOutlineClipboardDocumentCheck,
  HiOutlineChatBubbleLeftRight,
  HiOutlineFolderOpen,
  HiOutlineAcademicCap,
  HiOutlineMapPin,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
  HiOutlineClock,
  HiOutlineCheckCircle,
} from 'react-icons/hi2'
import { extractErrorMessage } from '../../../../infra/shared/utils/apiError'
import useToastStore from '../../../../infra/shared/store/useToastStore'
import useFullBleedStore from '../../../../infra/shared/store/useFullBleedStore'
import {
  fetchLessonDetail,
  type LessonContentForm,
  type LessonContentMaterial,
  type LessonContentQuiz,
  type LessonContentSurvey,
  type LessonContentType,
  type ScheduleLessonDetail,
  type LessonFlightPackContent,
} from './api'
import { HiOutlineLockClosed } from 'react-icons/hi2'
import LessonTrackCard from './LessonTrack'
import SendContentModal, { type SendTarget } from './SendContentModal'
import { useI18n } from '../../../../infra/locales/I18nContext'
// Where a student goes to take each content type (the existing module pages),
// with lesson context so that page can mark completion on submit.
const TAKE_ROUTE: Record<LessonContentType, string> = {
  quiz: '/assignment-assessment/quiz-bank',
  form: '/grading-attendance/formnew',
  survey: '/grading-attendance/surveynew',
}

const CONDUCT_PARTS: Array<{ key: string; label: string }> = [
  { key: 'BEGINNING', label: 'Beginning' },
  { key: 'MIDDLE', label: 'Middle' },
  { key: 'END', label: 'End' },
]

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// Authenticated download: the API expects a Bearer token (not a cookie), so a
// plain <a href> would 401. Fetch with the token, then save the blob.
// Authenticated fetch → Blob, shared by download and the in-app viewers.
async function fetchAuthedBlob(url: string): Promise<Blob> {
  const token = localStorage.getItem('access_token')
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  return res.blob()
}

async function downloadMaterial(url: string, filename: string): Promise<void> {
  const blob = await fetchAuthedBlob(url)
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objUrl)
}

// A small labelled chip for the hero meta row.
function MetaChip({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  if (!value) return null
  return (
    <div className="inline-flex items-center gap-1.5 rounded-[9px] bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1.5">
      <span className="text-[var(--accent)] text-[14px]">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--text-muted)]">{label}</span>
      <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

// One objective line: fixed narrow label + value that wraps (never truncated).
function ObjLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2.5">
      <span className="shrink-0 w-[112px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--text-muted)] pt-0.5">
        {label}
      </span>
      <span className="flex-1 text-[13px] text-[var(--text-primary)] leading-snug">
        {value || <span className="text-[var(--text-muted)]">—</span>}
      </span>
    </div>
  )
}

function Card({
  title,
  icon,
  count,
  accent,
  empty,
  children,
}: {
  title: string
  icon?: ReactNode
  count?: number
  accent?: boolean
  // When the card has no content it grows (flex-1) to fill the column height and
  // centres its hint, so empty panels never look stunted. Cards WITH content keep
  // their natural height (never clipped) — the page scrolls if they overflow.
  empty?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={`rounded-2xl border shadow-sm overflow-hidden flex flex-col ${empty ? 'flex-1' : ''} ${
        accent ? 'border-[var(--accent)]/40 bg-[var(--accent-light)]/30' : 'border-[var(--border)] bg-[var(--surface)]'
      }`}
    >
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        {icon && <span className="text-[var(--accent)] text-[16px]">{icon}</span>}
        <h2 className="text-[12.5px] font-bold text-[var(--text-primary)] uppercase tracking-[0.03em]">{title}</h2>
        {count != null && (
          <span className="ms-auto text-[11px] font-bold text-[var(--accent)] bg-[var(--accent-light)] rounded-full px-2 py-0.5 tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className={`p-4 ${empty ? 'flex-1 flex items-center justify-center' : ''}`}>{children}</div>
    </section>
  )
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-[var(--text-muted)] italic">{children}</p>
}

// An actionable activity item (quiz/form/survey/material). The action differs by
// capability: staff send/manage, learners take/complete/download.
function ActivityRow({
  title,
  meta,
  badge,
  action,
}: {
  title: string
  meta?: ReactNode
  badge?: ReactNode
  action: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5">
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="text-[13.5px] font-semibold text-[var(--text-primary)] leading-snug">{title}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {badge}
          {meta && <span className="text-[11px] text-[var(--text-muted)]">{meta}</span>}
        </div>
      </div>
      {action}
    </div>
  )
}

function Btn({
  icon,
  label,
  onClick,
  variant = 'soft',
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  variant?: 'soft' | 'solid'
}) {
  const cls =
    variant === 'solid'
      ? 'bg-[var(--accent)] text-white hover:opacity-90'
      : 'bg-[var(--accent-light)] text-[var(--accent)] hover:opacity-90'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-[8px] px-3 py-1.5 transition-opacity border-none cursor-pointer ${cls}`}
    >
      {icon}
      {label}
    </button>
  )
}

export default function LessonDetailPage() {
  const { courseInstanceId, lessonId } = useParams<{ courseInstanceId: string; lessonId: string }>()
  const navigate = useNavigate()
  // Session context carried from the clicked calendar block (see lessonDetailPath).
  // Present only when reached via a calendar entry; absent on a direct URL visit.
  const [searchParams] = useSearchParams()
  const placementId = searchParams.get('placementId')
  const sessionDate = searchParams.get('date')
  const [detail, setDetail] = useState<ScheduleLessonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { t } = useI18n()

  const cid = Number(courseInstanceId)
  const lid = Number(lessonId)

  // Teacher vs learner is decided by INSTRUCTOR MEMBERSHIP of this course
  // (backend-computed `canManage`), not by a permission/role name — an Instructor
  // role lacks the authoring perms but should still send content to its students.

  const canManage = detail?.canManage ?? false
  const isLearner = !canManage
  // When set, the student-picker modal is open for this content item (teacher).
  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null)

  // Drop the Layout's frame (esp. its large bottom padding) so the dashboard
  // uses the full height; we apply our own compact padding instead.
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetchLessonDetail(cid, lid)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setError(extractErrorMessage(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [cid, lid])

  const onDownload = useCallback(async (m: LessonContentMaterial) => {
    if (!m.downloadUrl) return
    try {
      await downloadMaterial(m.downloadUrl, m.filename)
    } catch (e) {
      useToastStore.getState().push({ variant: 'error', title: extractErrorMessage(e) })
    }
  }, [])

  const onView = useCallback((m: LessonContentMaterial) => {
    if (!m.libraryMaterialId) return
    navigate(`/course-management/library/view/${m.libraryMaterialId}`)
  }, [navigate])

  // Teacher: open the student-picker to send/manage an item's recipients.
  const openSend = useCallback(
    (
      kind: LessonContentType,
      contentId: number,
      label: string,
      releasedStudentIds: number[],
      completedStudentIds: number[],
    ) => {
      setSendTarget({ kind, contentId, label, releasedStudentIds, completedStudentIds })
    },
    [],
  )

  // Student: go take a released item in its module page, carrying lesson context
  // so that page marks it complete on submit.
  const onTake = useCallback((kind: LessonContentType, contentId: number) => {
    navigate(`${TAKE_ROUTE[kind]}?take=${contentId}&lessonCtx=${cid}:${lid}`)
  }, [cid, lid, navigate])

  // The per-item action, gated by capability + the item's released/taken state.
  const contentAction = useCallback(
    (item: LessonContentQuiz | LessonContentForm | LessonContentSurvey, kind: LessonContentType, contentId: number, label: string): ReactNode => {
      const { released, completedByMe, releasedStudentIds, completedStudentIds } = item
      if (canManage) {
        const sentCount = releasedStudentIds.length
        const total = detail?.enrolledStudents.length ?? 0
        return sentCount > 0 ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] bg-[var(--accent-light)] rounded-full px-2 py-1 tabular-nums">
              <HiOutlineCheckCircle className="text-[13px]" /> Sent {sentCount}/{total}
            </span>
            <Btn icon={<HiOutlineUserGroup className="text-[13px]" />} label="Manage" onClick={() => openSend(kind, contentId, label, releasedStudentIds, completedStudentIds)} />
          </div>
        ) : (
          <Btn icon={<HiOutlinePaperAirplane className="text-[13px]" />} label="Send" onClick={() => openSend(kind, contentId, label, releasedStudentIds, completedStudentIds)} />
        )
      }
      // Student
      if (completedByMe) {
        return (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-[#15803d] bg-[#15803d1a] rounded-full px-2.5 py-1">
            <HiOutlineCheckCircle className="text-[13px]" /> Done
          </span>
        )
      }
      if (!released) {
        return (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-full px-2.5 py-1">
            <HiOutlineLockClosed className="text-[13px]" /> Not released
          </span>
        )
      }
      return <Btn icon={<HiOutlineArrowTopRightOnSquare className="text-[13px]" />} label="Take" variant="solid" onClick={() => onTake(kind, contentId)} />
    },
    [canManage, detail?.enrolledStudents.length, openSend, onTake],
  )

  const allForms: LessonContentForm[] = detail ? [...detail.evaluationForms, ...detail.forms] : []
  const taskCount = detail ? detail.quizzes.length + allForms.length + detail.surveys.length + detail.flightPacks.length : 0
  const formsSurveysCount = allForms.length + (detail?.surveys.length ?? 0)

  return (
    <div className="flex flex-col h-full min-h-0 px-4 lg:px-6 pt-4 pb-3">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors bg-transparent border-none cursor-pointer px-0"
        >
          <HiOutlineArrowLeft className="text-[15px]" />
          Back to schedule
        </button>
        {detail && (
          <div className="flex items-center gap-2">
            {/* Only when reached from a calendar block: that block is a concrete
                session (placement), so attendance can be scoped to it. */}
            {placementId && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/grading-attendance/class-attendance?courseId=${cid}&lessonId=${lid}` +
                      `&placementId=${placementId}` +
                      (sessionDate ? `&date=${sessionDate}` : ''),
                  )
                }
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[var(--accent)] rounded-[9px] px-3 py-2 hover:opacity-90 transition-opacity border-none cursor-pointer"
              >
                <HiOutlineClipboardDocumentCheck className="text-[15px]" />
                Capture attendance
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/course-management/library?type=course${
                    detail.courseTitle ? `&course=${encodeURIComponent(detail.courseTitle)}` : ''
                  }`,
                )
              }
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--accent)] bg-[var(--accent-light)] rounded-[9px] px-3 py-2 hover:opacity-90 transition-opacity border-none cursor-pointer"
            >
              <HiOutlineBookOpen className="text-[15px]" />
              Course library
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--text-muted)]">
          Loading lesson detail…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-[13px] text-[#DC2626]">
          {error}
        </div>
      ) : detail ? (
        <div className="flex flex-col h-full min-h-0 gap-4">
          {/* Hero header */}
          <div className="shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm p-5">
            <div className="flex items-start gap-4">
              <div className="shrink-0 h-12 w-16 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center font-bold text-[15px]">
                {detail.lesson.lessonNumber || '—'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-bold text-[var(--accent)] tracking-[0.06em] uppercase">
                  {detail.courseTitle || 'Lesson detail'}
                </p>
                <h1 className="text-[20px] font-bold text-[var(--text-primary)] leading-snug">
                  {detail.lesson.lessonTitle || 'Untitled lesson'}
                </h1>
                <div className="flex flex-wrap gap-2 mt-3">
                  <MetaChip icon={<HiOutlineAcademicCap />} label="Env" value={detail.lesson.environmentLabel} />
                  <MetaChip icon={<HiOutlineClock />} label="Type" value={detail.lesson.periodTypeLabel} />
                  <MetaChip icon={<HiOutlineClock />} label="Periods" value={String(detail.lesson.totalPeriods)} />
                  <MetaChip icon={<HiOutlineUserGroup />} label="Ratio" value={detail.lesson.instructorStudentRatio} />
                  <MetaChip icon={<HiOutlineMapPin />} label="Location" value={detail.lesson.location} />
                </div>
              </div>
            </div>
            {/* Role banner */}
            <div
              className={`mt-4 flex items-center gap-2 rounded-[10px] px-3.5 py-2.5 text-[12.5px] ${
                isLearner
                  ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                  : 'bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {isLearner ? <HiOutlineCheckCircle className="text-[16px] shrink-0" /> : <HiOutlinePaperAirplane className="text-[16px] shrink-0" />}
              <span className="font-semibold">
                {isLearner
                  ? `You have ${taskCount} task${taskCount === 1 ? '' : 's'} to complete in this lesson.`
                  : 'Review the lesson and send its quizzes, forms, surveys and materials to your students.'}
              </span>
            </div>
          </div>

          {/* One page-level scroller. The grid is at least the visible height
              (min-h-full) so empty cards grow to fill it; when content is large
              the grid grows past it and the page scrolls — content is never clipped. */}
          <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar-light">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-full items-stretch">
              {/* LEFT — the lesson */}
              <div className="flex flex-col gap-4">
              <Card title="Objectives & Teaching Points" icon={<HiOutlineClipboardDocumentList />} count={detail.lesson.units.length} empty={detail.lesson.units.length === 0}>
                {detail.lesson.units.length === 0 ? (
                  <EmptyHint>No objectives added for this lesson.</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {detail.lesson.units.map((u, i) => (
                      <div key={i} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent)] mb-2">Unit {i + 1}</p>
                        <div className="flex flex-col gap-1.5">
                          <ObjLine label="Training obj." value={u.trainingObjective} />
                          <ObjLine label="Enabling obj." value={u.enablingObjective} />
                          <ObjLine label="Teaching point" value={u.teachingPoint} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Conduct of Lesson" icon={<HiOutlineClipboardDocumentCheck />} empty={detail.lesson.conducts.length === 0}>
                {detail.lesson.conducts.length === 0 ? (
                  <EmptyHint>No conduct steps added.</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-3">
                    {CONDUCT_PARTS.map(({ key, label }) => {
                      const rows = detail.lesson.conducts.filter((c) => (c.part ?? '').toUpperCase() === key)
                      if (rows.length === 0) return null
                      return (
                        <div key={key} className="flex flex-col gap-1.5">
                          <p className="text-[10.5px] font-bold text-[var(--accent)] uppercase tracking-wide">{label}</p>
                          {rows.map((c, i) => (
                            <div key={i} className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 flex flex-col gap-1">
                              {c.point && <p className="text-[13px] text-[var(--text-primary)] leading-snug">{c.point}</p>}
                              {c.material && <p className="text-[11.5px] text-[var(--text-muted)]">Material: {c.material}</p>}
                              {c.notes && <p className="text-[11.5px] text-[var(--text-muted)]">Notes: {c.notes}</p>}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              <Card title="Resources" icon={<HiOutlineFolderOpen />} count={detail.lesson.resources.length} empty={detail.lesson.resources.length === 0}>
                {detail.lesson.resources.length === 0 ? (
                  <EmptyHint>No resources attached.</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {detail.lesson.resources.map((r, i) => (
                      <div key={i} className="flex items-center gap-2.5 rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                        <span className="text-[13px] text-[var(--text-primary)] flex-1 leading-snug">{r.label || '—'}</span>
                        {r.categoryLabel && (
                          <span className="shrink-0 text-[10.5px] font-semibold text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-full px-2 py-0.5">
                            {r.categoryLabel}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {detail.lesson.healthAndSafety && (
                <Card title="Health & Safety" icon={<HiOutlineShieldCheck />}>
                  <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{detail.lesson.healthAndSafety}</p>
                </Card>
              )}
            </div>

            {/* RIGHT — activities (role-aware) */}
            <div className="flex flex-col gap-4">
              <Card title={isLearner ? 'Quizzes to take' : 'Quizzes'} icon={<HiOutlineAcademicCap />} count={detail.quizzes.length} accent={isLearner} empty={detail.quizzes.length === 0}>
                {detail.quizzes.length === 0 ? (
                  <EmptyHint>{isLearner ? 'No quizzes assigned.' : 'No quizzes attached.'}</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-2">
                    {detail.quizzes.map((q: LessonContentQuiz) => (
                      <ActivityRow
                        key={q.id}
                        title={q.name}
                        meta={
                          <>
                            {q.questionCount} question{q.questionCount === 1 ? '' : 's'}
                            {q.assessmentType ? ` · ${q.assessmentType}` : ''}
                            {q.passPercentage > 0 ? ` · pass ${q.passPercentage}%` : ''}
                          </>
                        }
                        action={contentAction(q, 'quiz', q.quizId, q.name)}
                      />
                    ))}
                  </div>
                )}
              </Card>

              <Card title={isLearner ? t('schedule.lessonDetail.formsSurveysTitleStudent') : t('schedule.lessonDetail.formsSurveysTitle')} icon={<HiOutlineChatBubbleLeftRight />} count={formsSurveysCount + detail.flightPacks.length} accent={isLearner} empty={allForms.length + detail.surveys.length + detail.flightPacks.length === 0}>
                {allForms.length + detail.surveys.length + detail.flightPacks.length === 0 ? (
                  <EmptyHint>{isLearner ? 'Nothing assigned.' : 'No forms, surveys or flight packs attached.'}</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-2">
                    {allForms.map((f: LessonContentForm) => (
                      <ActivityRow
                        key={`f-${f.id}`}
                        title={f.title}
                        badge={<span className="text-[10px] font-bold uppercase text-[var(--accent)] bg-[var(--accent-light)] rounded px-1.5 py-0.5">Form</span>}
                        meta={`${f.questionCount} question${f.questionCount === 1 ? '' : 's'}`}
                        action={contentAction(f, 'form', f.formId, f.title)}
                      />
                    ))}
                    {detail.surveys.map((s: LessonContentSurvey) => (
                      <ActivityRow
                        key={`s-${s.id}`}
                        title={s.title}
                        badge={<span className="text-[10px] font-bold uppercase text-[#7c3aed] bg-[#7c3aed1a] rounded px-1.5 py-0.5">Survey</span>}
                        meta={`${s.questionCount} question${s.questionCount === 1 ? '' : 's'}`}
                        action={contentAction(s, 'survey', s.surveyId, s.title)}
                      />
                    ))}
                    {detail.flightPacks.map((fp: LessonFlightPackContent) => (
                      <ActivityRow
                        key={`fp-${fp.id}`}
                        title={fp.packageName}
                        badge={<span className="text-[10px] font-bold uppercase text-[#d97706] bg-[#d977061a] rounded px-1.5 py-0.5">Flight Package</span>}
                        meta={`${fp.taskCount} task${fp.taskCount !== 1 ? 's' : ''}`}
                        action={canManage ? (
                          <Btn icon={<HiOutlineArrowTopRightOnSquare className="text-[13px]" />} label={t('schedule.lessonDetail.flightPackageLink')} variant="solid" onClick={() => navigate(`/grading-attendance/grading/course-pick/${cid}?tab=flight-pack`)} />
                        ) : undefined}
                      />
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Materials" icon={<HiOutlineFolderOpen />} count={detail.materials.length} empty={detail.materials.length === 0}>
                {detail.materials.length === 0 ? (
                  <EmptyHint>No materials attached.</EmptyHint>
                ) : (
                  <div className="flex flex-col gap-2">
                    {detail.materials.map((m: LessonContentMaterial) => (
                      <ActivityRow
                        key={m.id}
                        title={m.filename}
                        meta={`${formatBytes(m.fileSize)}${m.contentType ? ` · ${m.contentType}` : ''}`}
                        action={
                          <div className="flex items-center gap-2">
                            {m.libraryMaterialId && (
                              <Btn icon={<HiOutlineEye className="text-[13px]" />} label="View" onClick={() => onView(m)} />
                            )}
                            <Btn icon={<HiOutlineArrowDownTray className="text-[13px]" />} label="Download" onClick={() => onDownload(m)} />
                          </div>
                        }
                      />
                    ))}
                  </div>
                )}
              </Card>
              <LessonTrackCard
                courseInstanceId={detail.courseInstanceId}
                lessonId={lid}
                canManage={canManage}
                enrolledStudents={detail.enrolledStudents}
                onToggleSuccess={() => {
                  fetchLessonDetail(cid, lid).then((d) => {
                    if (d) setDetail(d)
                  }).catch(() => {})
                }}
              />              
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Teacher student-picker for sending / managing a quiz/form/survey. */}
      {detail && sendTarget && (
        <SendContentModal
          courseInstanceId={cid}
          lessonId={lid}
          target={sendTarget}
          students={detail.enrolledStudents}
          onClose={() => setSendTarget(null)}
          onDone={(updated) => setDetail(updated)}
        />
      )}
    </div>
  )
}
