import {useCallback, useEffect, useMemo, useState} from 'react'
import {useNavigate, useParams, useSearchParams} from 'react-router-dom'
import {useShallow} from 'zustand/react/shallow'
import {
  HiOutlineArrowLeft,
  HiOutlineExclamationCircle,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserCircle,
} from 'react-icons/hi2'
import {useToast} from '../../../infra/shared/store/useToastStore'
import {confirmDialog} from '../../../infra/shared/store/useConfirmStore'
import {
  addCourseInstructor,
  addCourseOther,
  addCourseStudent,
  getCoursePersonnel,
  listPersonnelCandidates,
  removeCourseInstructor,
  removeCourseOther,
  removeCourseStudent,
  type CoursePersonnel,
  type PersonnelCandidate,
  type PersonnelKind,
  type PersonnelMember,
} from './api'
import useCourseSelectionStore from './store'
import Breadcrumb, {courseCategoryCrumbs} from '../_shared/Breadcrumb'

const BASE_PATH = '/course-management/course-selection'

type TabKey = 'students' | 'instructors' | 'others'

const TABS: {key: TabKey; label: string; kind: PersonnelKind}[] = [
  {key: 'students', label: 'Student Selection', kind: 'student'},
  {key: 'instructors', label: 'Instructor Selection', kind: 'instructor'},
  {key: 'others', label: 'Other Selection', kind: 'other'},
]

export default function PersonnelPage() {
  const {id} = useParams<{id: string}>()
  const courseId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const detailPath = `${BASE_PATH}/${courseId}`

  const {current, fetchOne, update} = useCourseSelectionStore(
    useShallow((s) => ({current: s.current, fetchOne: s.fetchOne, update: s.update})),
  )

  // The active tab lives in the URL so it survives navigating away and back
  // (e.g. viewing a member's profile and returning via its Back button).
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'students'
  const setTab = (key: TabKey) =>
    setSearchParams(key === 'students' ? {} : {tab: key}, {replace: true})

  const [personnel, setPersonnel] = useState<CoursePersonnel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isFinite(courseId)) return
    setLoading(true)
    setError(null)
    try {
      const resp = await getCoursePersonnel(courseId)
      if (resp.success && resp.data) setPersonnel(resp.data)
      else setError(resp.error?.message ?? 'Failed to load personnel')
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load personnel')
    } finally {
      setLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    void load()
    if (Number.isFinite(courseId) && current?.id !== courseId) void fetchOne(courseId)
  }, [load, courseId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = TABS.find((t) => t.key === tab)!
  const members: PersonnelMember[] = personnel?.[tab] ?? []

  const handleAdd = async (candidate: PersonnelCandidate) => {
    try {
      const resp =
        tab === 'students'
          ? await addCourseStudent(courseId, candidate.profile_id)
          : tab === 'instructors'
          ? await addCourseInstructor(courseId, candidate.profile_id)
          : await addCourseOther(courseId, candidate.profile_id)
      if (resp.success && resp.data) {
        setPersonnel(resp.data)
        toast.success({title: `${candidate.full_name} added`})
      } else {
        toast.error({title: resp.error?.message ?? 'Failed to add'})
      }
    } catch (e: any) {
      toast.error({title: e?.message ?? 'Failed to add'})
    }
  }

  // Opens the same screen as Profile General Info, but for the selected user.
  const handleViewProfile = (member: PersonnelMember) => {
    if (!member.username) return
    navigate('/profile-general-info', {state: {user: {username: member.username}}})
  }

  const handleRemove = async (member: PersonnelMember) => {
    const ok = await confirmDialog({
      title: 'Remove member?',
      message: `Remove ${member.full_name} from this course?`,
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    try {
      if (tab === 'students') await removeCourseStudent(courseId, member.profile_id)
      else if (tab === 'instructors') await removeCourseInstructor(courseId, member.profile_id)
      else await removeCourseOther(courseId, member.profile_id)
      await load()
      toast.success({title: `${member.full_name} removed`})
    } catch (e: any) {
      toast.error({title: e?.message ?? 'Failed to remove'})
    }
  }

  // Personnel completion is binary, mirroring Material/Evaluation: the user
  // marks the category complete once the selections are done.
  const complete = (current?.personnel_completion ?? 0) >= 100
  // Approved (and stopped) instances are locked: a completed category can't be
  // reopened until the approval is cancelled (mirrors Course Builder).
  const approved = ['approved', 'stopped'].includes((current?.status ?? '').toLowerCase())
  const handleMarkComplete = async () => {
    if (!current) return
    if (complete && approved) return
    try {
      await update(current.id, {
        title: current.title,
        status: current.status,
        start_date: current.start_date,
        course_date: current.course_date,
        personnel_completion: complete ? 0 : 100,
      })
      toast.success({title: complete ? 'Personnel reopened' : 'Personnel marked complete'})
    } catch (e: any) {
      toast.error({title: e?.message ?? 'Failed to update'})
    }
  }

  return (
    <div >
      <Breadcrumb
        className="mb-3"
        items={courseCategoryCrumbs({
          scopeLabel: 'Course Selection',
          listPath: BASE_PATH,
          courseTitle: current?.title,
          detailPath,
          categoryLabel: 'Personnel',
        })}
      />
      <button
        onClick={() => navigate(detailPath)}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
      >
        <HiOutlineArrowLeft className="text-[14px]" />
        Back to Course Selection
      </button>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase mb-1">
            Personnel
          </p>
          <h2 className="text-[22px] font-bold text-primary tracking-[-0.02em]">
            {current?.title ?? '…'}
          </h2>
          <p className="text-[13px] text-secondary mt-1">
            Enroll students, instructors and other staff to this course.
          </p>
        </div>
        <button
          type="button"
          onClick={handleMarkComplete}
          disabled={complete && approved}
          title={
            complete && approved
              ? 'Approved courses cannot be reopened. Cancel approval first.'
              : undefined
          }
          className={`px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
            complete
              ? 'bg-[rgba(100,116,139,0.10)] text-[#64748B] hover:bg-[rgba(100,116,139,0.18)] cursor-pointer'
              : 'bg-[rgba(34,197,94,0.10)] text-[#16A34A] hover:bg-[rgba(34,197,94,0.18)] cursor-pointer'
          }`}
        >
          {complete ? 'Reopen' : 'Mark Complete'}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <HiOutlineExclamationCircle className="text-red-500 text-[15px] mt-px shrink-0" />
          <p className="text-sm text-red-500 flex-1">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-bd mb-4">
        {TABS.map((t) => {
          const count = personnel?.[t.key]?.length ?? 0
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-[13px] font-semibold bg-transparent border-none cursor-pointer transition-colors border-b-2 -mb-px ${
                tab === t.key
                  ? 'text-accent border-b-accent'
                  : 'text-muted border-b-transparent hover:text-primary'
              }`}
              style={{borderBottomStyle: 'solid', borderBottomWidth: 2}}
            >
              {t.label}
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-surface-2 text-[10.5px] text-muted">
                {count}
              </span>
            </button>
          )
        })}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-1 rounded-[8px] bg-accent text-white text-[12px] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
        >
          <HiOutlinePlus className="text-[13px]" />
          Add {tab === 'students' ? 'Student' : tab === 'instructors' ? 'Instructor' : 'Person'}
        </button>
      </div>

      {/* Member table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{background: 'var(--navy)'}}>
              <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Name</th>
              <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Username</th>
              <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Rank</th>
              <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Email</th>
              {tab === 'others' && (
                <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Roles</th>
              )}
              <th className="px-4 py-3 text-start text-[11px] font-bold text-white/60 uppercase tracking-[0.06em] w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            {members.map((m) => (
              <tr key={m.profile_id} className="hover:bg-surface-2 transition-colors duration-100">
                <td className="px-4 py-3 text-sm font-semibold text-primary">{m.full_name}</td>
                <td className="px-4 py-3 text-sm text-secondary">{m.username ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-secondary">{m.rank ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-secondary">{m.email ?? '—'}</td>
                {tab === 'others' && (
                  <td className="px-4 py-3">
                    {m.roles.length === 0 ? (
                      <span className="text-sm text-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {m.roles.map((r) => (
                          <span
                            key={r}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                            style={{background: 'rgba(6,85,92,0.10)', color: 'var(--accent)'}}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleViewProfile(m)}
                      disabled={!m.username}
                      title={m.username ? 'View profile' : 'No linked user account'}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-[7px] bg-surface-2 border border-bd text-muted hover:text-accent cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <HiOutlineUserCircle className="text-[14px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(m)}
                      title="Remove"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-[7px] bg-surface-2 border border-bd text-muted hover:text-red-500 cursor-pointer transition-colors"
                    >
                      <HiOutlineTrash className="text-[13px]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {members.length === 0 && !loading && (
              <tr>
                <td colSpan={tab === 'others' ? 6 : 5} className="text-center py-12 text-muted text-sm">
                  No one enrolled yet — click <span className="font-semibold">Add</span> to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddPersonModal
          kind={activeTab.kind}
          tabLabel={activeTab.label}
          courseId={courseId}
          // A person can only be added once per course, regardless of tab.
          excludeIds={
            new Set(
              [
                ...(personnel?.students ?? []),
                ...(personnel?.instructors ?? []),
                ...(personnel?.others ?? []),
              ].map((m) => m.profile_id),
            )
          }
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}

// ─── Add-person modal ────────────────────────────────────────────────────────

interface AddProps {
  kind: PersonnelKind
  tabLabel: string
  courseId: number
  excludeIds: Set<number>
  onAdd: (candidate: PersonnelCandidate) => Promise<void>
  onClose: () => void
}

function AddPersonModal({kind, tabLabel, courseId, excludeIds, onAdd, onClose}: AddProps) {
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<PersonnelCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)

  // Debounced candidate search.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const resp = await listPersonnelCandidates(kind, search.trim() || undefined, courseId)
        if (!cancelled && resp.success && resp.data) setCandidates(resp.data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [kind, search, courseId])

  const visible = useMemo(
    () => candidates.filter((c) => !excludeIds.has(c.profile_id)),
    [candidates, excludeIds],
  )

  const handlePick = async (c: PersonnelCandidate) => {
    setAdding(c.profile_id)
    try {
      await onAdd(c)
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-bd shadow-elevated w-[90%] max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-bd">
          <p className="text-base font-bold text-primary">{tabLabel}</p>
          <p className="text-[12px] text-muted mt-0.5">Search and add a person to this course.</p>
        </div>

        <div className="p-4 flex flex-col gap-3 min-h-0">
          <div className="relative">
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or username…"
              autoFocus
              className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-bd rounded-lg text-primary text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
            {loading && visible.length === 0 ? (
              <p className="text-center py-8 text-[13px] text-muted">Searching…</p>
            ) : visible.length === 0 ? (
              <p className="text-center py-8 text-[13px] text-muted">No matching users.</p>
            ) : (
              visible.map((c) => {
                // A student already on a non-closed course can't join another
                // (one student → one active course at a time).
                const blocked = kind === 'student' && !!c.active_course_title
                return (
                  <div
                    key={c.profile_id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-[9px] border border-bd transition-colors ${
                      blocked ? 'opacity-60' : 'hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-primary truncate">{c.full_name}</p>
                      <p className="text-[11px] text-muted truncate">
                        {[c.username, c.rank, c.roles.join(', ')].filter(Boolean).join(' · ')}
                      </p>
                      {blocked && (
                        <p className="text-[11px] text-amber-600 truncate mt-0.5 flex items-center gap-1">
                          <HiOutlineExclamationCircle className="text-[12px] shrink-0" />
                          Already in active course: {c.active_course_title}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={blocked || adding === c.profile_id}
                      onClick={() => handlePick(c)}
                      title={
                        blocked
                          ? `${c.full_name} is already enrolled in "${c.active_course_title}"`
                          : `Add ${c.full_name}`
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] text-xs font-semibold bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      <HiOutlinePlus className="text-[12px]" />
                      {adding === c.profile_id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-bd flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] text-sm font-semibold text-secondary bg-surface-2 border border-bd hover:bg-surface transition-colors cursor-pointer font-sans"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
