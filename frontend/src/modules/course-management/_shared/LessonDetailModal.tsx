import { useEffect, type ReactNode } from 'react'
import { HiOutlineXMark } from 'react-icons/hi2'
import type { LessonConductItem } from '../course-info/editor/tabs/LessonCreationTab'
import useLessonDetailStore, {
  prefetchLessonDetails,
  lessonDetailKey,
  masterLessonDetailApi,
  type LessonDetailApi,
} from './lesson-detail-cache'

interface Props {
  masterId: number
  lessonId: number
  // Data source for lessons (master vs instance). Defaults to master.
  api?: LessonDetailApi
  // Quick labels already known from the schedule catalogue (shown instantly /
  // as fallback while the full lesson loads).
  fallback: {
    lessonNumber: string
    lessonTitle: string
    environmentLabel: string | null
    periodTypeLabel: string | null
    periods: number
    periodPerUnit: number
  }
  onClose: () => void
}

type LabelMap = Map<number, string>

const EMPTY_NUM: LabelMap = new Map()
const EMPTY_STR: Map<string, string> = new Map()

const CONDUCT_PARTS: Array<{ key: string; label: string }> = [
  { key: 'BEGINNING', label: 'Beginning' },
  { key: 'MIDDLE', label: 'Middle' },
  { key: 'END', label: 'End' },
]

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-muted">{label}</span>
      <span className="text-[13px] text-primary">{value || <span className="text-muted">—</span>}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-secondary border-b border-bd pb-1">
      {children}
    </h3>
  )
}

export default function LessonDetailModal({
  masterId,
  lessonId,
  fallback,
  onClose,
  api = masterLessonDetailApi,
}: Props) {
  // Ensure the course-wide detail bundle is loaded (deduped; usually already
  // prefetched when the block scrolled into view).
  useEffect(() => {
    prefetchLessonDetails(masterId, api)
  }, [masterId, api])

  const bundle = useLessonDetailStore((s) => s.byKey[lessonDetailKey(api, masterId)])
  const loading = !bundle || bundle.status === 'loading'
  const lesson = bundle?.lessons.get(lessonId) ?? null
  const toMap = bundle?.toMap ?? EMPTY_NUM
  const eoMap = bundle?.eoMap ?? EMPTY_NUM
  const tpMap = bundle?.tpMap ?? EMPTY_NUM
  const resMap = bundle?.resMap ?? EMPTY_NUM
  const catMap = bundle?.catMap ?? EMPTY_STR
  const error =
    bundle?.status === 'error'
      ? bundle.error ?? 'Failed to load lesson detail.'
      : bundle?.status === 'ready' && !lesson
        ? 'This lesson is no longer in the Lesson Creation catalogue.'
        : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const idLabel = (m: LabelMap, v: number | string | null | undefined) =>
    v == null || v === '' ? '' : m.get(Number(v)) ?? ''

  const units = lesson?.units ?? []
  const resources = lesson?.resources ?? []
  const conducts = lesson?.conducts ?? []
  const conductsByPart = (part: string): LessonConductItem[] =>
    conducts.filter((c) => (c.part ?? '').toUpperCase() === part)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[80vw] h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 py-4 border-b border-bd">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-accent tracking-[0.06em] uppercase">Lesson detail</p>
            <h2 className="text-[16px] font-bold text-primary leading-snug truncate">
              <span className="text-secondary">{lesson?.lessonNumber || fallback.lessonNumber}</span>{' '}
              {lesson?.lessonTitle || fallback.lessonTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mt-1 -mr-1 h-7 w-7 inline-flex items-center justify-center rounded-[7px] text-muted hover:text-primary hover:bg-surface-2 transition-colors cursor-pointer border-none bg-transparent"
          >
            <HiOutlineXMark className="text-[16px]" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto thin-scrollbar-light flex-1 min-h-0 flex flex-col gap-5">
          {loading ? (
            <p className="text-[13px] text-muted py-6 text-center">Loading lesson detail…</p>
          ) : (
            <>
              {error && (
                <div className="rounded-[8px] border border-[#FCA5A5] bg-[rgba(220,38,38,0.06)] px-3 py-2 text-[12px] text-[#DC2626]">
                  {error}
                </div>
              )}

              {/* General */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Environment" value={fallback.environmentLabel} />
                <Field label="Period type" value={fallback.periodTypeLabel} />
                <Field label="Total periods" value={String(lesson?.flightTiming ?? fallback.periods)} />
                <Field
                  label="Period per unit"
                  value={String(lesson?.periodPerUnit ?? fallback.periodPerUnit)}
                />
                <Field label="Instructor : Student" value={lesson?.instructorStudentRatio} />
                <div className="col-span-2">
                  <Field label="Location" value={lesson?.location} />
                </div>
                <div className="col-span-2">
                  <Field label="Health & safety" value={lesson?.healthAndSafety} />
                </div>
              </div>

              {/* Objectives & teaching points */}
              <div className="flex flex-col gap-2">
                <SectionTitle>Objectives &amp; teaching points</SectionTitle>
                {units.length === 0 ? (
                  <p className="text-[12px] text-muted italic">No objectives added.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {units.map((u, i) => (
                      <div key={i} className="rounded-[8px] border border-bd bg-surface-2 px-3 py-2 grid grid-cols-3 gap-2">
                        <Field label="Training obj." value={idLabel(toMap, u.trainingObjectiveId)} />
                        <Field label="Enabling obj." value={idLabel(eoMap, u.enablingObjectiveId)} />
                        <Field label="Teaching point" value={idLabel(tpMap, u.teachingPointId)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resources */}
              <div className="flex flex-col gap-2">
                <SectionTitle>Resources</SectionTitle>
                {resources.length === 0 ? (
                  <p className="text-[12px] text-muted italic">No resources attached.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {resources.map((r, i) => (
                      <li key={i} className="text-[13px] text-primary flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <span>{idLabel(resMap, r.resourceId) || '—'}</span>
                        {r.category && (
                          <span className="text-[11px] text-muted">· {catMap.get(r.category) ?? r.category}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Conduct */}
              <div className="flex flex-col gap-2">
                <SectionTitle>Conduct of lesson</SectionTitle>
                {conducts.length === 0 ? (
                  <p className="text-[12px] text-muted italic">No conduct steps added.</p>
                ) : (
                  CONDUCT_PARTS.map(({ key, label }) => {
                    const rows = conductsByPart(key)
                    if (rows.length === 0) return null
                    return (
                      <div key={key} className="flex flex-col gap-1">
                        <p className="text-[11px] font-bold text-accent">{label}</p>
                        {rows.map((c, i) => (
                          <div key={i} className="rounded-[8px] border border-bd bg-surface-2 px-3 py-2 flex flex-col gap-0.5">
                            {c.point && <p className="text-[13px] text-primary">{c.point}</p>}
                            {c.material && <p className="text-[11px] text-muted">Reference Material: {c.material}</p>}
                            {c.notes && <p className="text-[11px] text-muted">Notes: {c.notes}</p>}
                          </div>
                        ))}
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end px-6 py-3 bg-surface-2 border-t border-bd">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface border border-bd hover:bg-surface-2 transition-colors cursor-pointer font-sans"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
