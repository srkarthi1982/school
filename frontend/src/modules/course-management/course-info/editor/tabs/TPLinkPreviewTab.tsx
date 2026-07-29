import { useEffect, useMemo, useState } from 'react'
import {
  HiOutlineChevronDown,
  HiOutlineChevronUpDown,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2'
import { type TpLinkPreviewData } from '../../api'
import { useCourseInfoApi } from '../ApiContext'
import type { TabProps } from './types'

// Read-only preview: teaching points used by lessons, shown as a
// TO -> EO -> TP tree, followed by the teaching points no lesson uses yet.
// Gated by the editor to only appear once Lesson Creation is complete.
export default function TPLinkPreviewTab({ courseInfoId, reloadToken }: TabProps<unknown>) {
  const api = useCourseInfoApi()
  const [data, setData] = useState<TpLinkPreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  // Collapsed TO cards / EO groups, keyed by their tree position. Everything
  // starts expanded; toggling only hides that node's children.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleNode = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Every collapsible key in the tree (TO cards + their EO groups) — drives
  // the expand/collapse-all toggle.
  const allKeys = useMemo(() => {
    const keys: string[] = []
    ;(data?.associated ?? []).forEach((to, ti) => {
      const toKey = `to:${to.trainingObjectiveId ?? ti}`
      keys.push(toKey)
      to.enablingObjectives.forEach((eo, ei) => {
        keys.push(`${toKey}|eo:${eo.enablingObjectiveId ?? ei}`)
      })
    })
    return keys
  }, [data])

  // "All collapsed" once every TO card is closed (hidden EO keys don't count).
  const allCollapsed =
    allKeys.length > 0 &&
    (data?.associated ?? []).every((to, ti) => collapsed.has(`to:${to.trainingObjectiveId ?? ti}`))

  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(allKeys))

  useEffect(() => {
    if (!courseInfoId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const resp = await api.getTpLinkPreview(courseInfoId)
        if (cancelled) return
        if (resp.success && resp.data) {
          setData(resp.data)
          setCollapsed(new Set()) // fresh tree — expand everything
        }
      } catch {
        // Leave data null — the empty state explains there's nothing to show.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api, courseInfoId, reloadToken])

  const associatedCount = useMemo(
    () =>
      (data?.associated ?? []).reduce(
        (sum, to) =>
          sum +
          to.enablingObjectives.reduce((s, eo) => s + eo.teachingPoints.length, 0),
        0,
      ),
    [data],
  )

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="pb-3 border-b border-[var(--border)]">
        <h2 className="text-[18px] font-bold text-primary">TP Link Preview</h2>
        <p className="text-[12px] text-muted mt-0.5">
          Teaching points used across lessons, grouped by Training Objective →
          Enabling Objective → Teaching Point.
        </p>
      </header>

      {loading ? (
        <div className="text-[13px] text-muted py-10 text-center">Loading…</div>
      ) : (
        <>
          {/* ── Associated TPs (the TO → EO → TP tree) ── */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-primary">Associated Teaching Points</h3>
              <span className="px-2 py-0.5 rounded-full bg-[rgba(34,197,94,0.12)] text-[#16A34A] text-[11px] font-semibold">
                {associatedCount}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={toggleAll}
                disabled={allKeys.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] text-secondary text-[12px] font-semibold border border-[var(--border)] cursor-pointer hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={allCollapsed ? 'Expand every TO and EO' : 'Collapse every TO and EO'}
              >
                <HiOutlineChevronUpDown className="text-[14px]" />
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            </div>

            {(data?.associated.length ?? 0) === 0 ? (
              <div className="text-[13px] text-muted py-6 text-center rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface-2)]">
                No teaching points are associated with any lesson yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {data!.associated.map((to, ti) => {
                  const toKey = `to:${to.trainingObjectiveId ?? ti}`
                  const toCollapsed = collapsed.has(toKey)
                  const toTpCount = to.enablingObjectives.reduce(
                    (s, eo) => s + eo.teachingPoints.length,
                    0,
                  )
                  return (
                    <div
                      key={to.trainingObjectiveId ?? `to-${ti}`}
                      className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4"
                    >
                      <button
                        type="button"
                        onClick={() => toggleNode(toKey)}
                        aria-expanded={!toCollapsed}
                        className="group flex items-center gap-2 w-full bg-transparent border-none p-0 cursor-pointer text-left"
                      >
                        <HiOutlineChevronDown
                          className={`text-[14px] text-muted transition-transform ${toCollapsed ? '-rotate-90' : ''}`}
                        />
                        <span className="px-1.5 py-0.5 rounded-[6px] bg-accent-light text-accent text-[10.5px] font-bold tracking-wide">
                          TO
                        </span>
                        <span className="text-[14px] font-bold text-primary group-hover:text-accent transition-colors">
                          {to.label}
                        </span>
                        {toCollapsed && (
                          <span className="text-[11px] text-muted">
                            {to.enablingObjectives.length}{' '}
                            {to.enablingObjectives.length === 1 ? 'EO' : 'EOs'} · {toTpCount}{' '}
                            {toTpCount === 1 ? 'TP' : 'TPs'}
                          </span>
                        )}
                      </button>

                      {!toCollapsed && (
                        <div className="mt-3 flex flex-col gap-3 pl-3 border-l-2 border-[var(--border)]">
                          {to.enablingObjectives.map((eo, ei) => {
                            const eoKey = `${toKey}|eo:${eo.enablingObjectiveId ?? ei}`
                            const eoCollapsed = collapsed.has(eoKey)
                            return (
                              <div key={eo.enablingObjectiveId ?? `eo-${ei}`} className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleNode(eoKey)}
                                  aria-expanded={!eoCollapsed}
                                  className="group flex items-center gap-2 w-full bg-transparent border-none p-0 cursor-pointer text-left"
                                >
                                  <HiOutlineChevronDown
                                    className={`text-[13px] text-muted transition-transform ${eoCollapsed ? '-rotate-90' : ''}`}
                                  />
                                  <span className="px-1.5 py-0.5 rounded-[6px] bg-[rgba(59,130,246,0.12)] text-[#2563EB] text-[10.5px] font-bold tracking-wide">
                                    EO
                                  </span>
                                  <span className="text-[13px] font-semibold text-primary group-hover:text-accent transition-colors">
                                    {eo.label}
                                  </span>
                                  {eoCollapsed && (
                                    <span className="text-[11px] text-muted">
                                      {eo.teachingPoints.length}{' '}
                                      {eo.teachingPoints.length === 1 ? 'TP' : 'TPs'}
                                    </span>
                                  )}
                                </button>

                                {!eoCollapsed && (
                                  <div className="flex flex-wrap gap-1.5 pl-3">
                                    {eo.teachingPoints.map((tp) => (
                                      <span
                                        key={tp.id}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-primary"
                                      >
                                        <span className="px-1 py-0.5 rounded-[5px] bg-[rgba(34,197,94,0.12)] text-[#16A34A] text-[9.5px] font-bold">
                                          TP
                                        </span>
                                        {tp.label}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Unassociated TPs ── */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-primary">Not Yet Associated</h3>
              <span className="px-2 py-0.5 rounded-full bg-[rgba(245,158,11,0.14)] text-[#D97706] text-[11px] font-semibold">
                {data?.unassociated.length ?? 0}
              </span>
            </div>

            {(data?.unassociated.length ?? 0) === 0 ? (
              <div className="text-[13px] text-muted py-6 text-center rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface-2)]">
                Every teaching point is associated with at least one lesson.
              </div>
            ) : (
              <div className="rounded-[10px] border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.06)] p-4 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <HiOutlineExclamationTriangle className="text-[16px] text-[#D97706] mt-0.5 flex-none" />
                  <p className="text-[12.5px] text-secondary">
                    These teaching points are <span className="font-semibold">not yet associated with any lesson</span>.
                    Add them to a lesson on the Lesson Creation tab so they appear in the structure above.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data!.unassociated.map((tp) => (
                    <span
                      key={tp.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[var(--surface)] border border-[var(--border)] text-[12px] text-primary"
                    >
                      <span className="px-1 py-0.5 rounded-[5px] bg-[rgba(245,158,11,0.16)] text-[#D97706] text-[9.5px] font-bold">
                        TP
                      </span>
                      {tp.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
