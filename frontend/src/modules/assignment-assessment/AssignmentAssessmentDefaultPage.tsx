import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentText,
  HiOutlinePencilSquare,
  HiOutlineBookOpen,
  HiOutlineClock,
} from 'react-icons/hi2'
import { useI18n } from '../../infra/locales/I18nContext'
import SectionHeader from '../../infra/shared/components/SectionHeader'
import useAssignmentAssessmentDefaultStore from './store'

type SectionId = 'active' | 'submissions' | 'tests'

interface NavItem { id: SectionId; label: string; icon: React.ReactNode }

const ASSIGNMENT_STATUS: Record<'not_started' | 'in_progress' | 'almost_done', { label: string; bg: string; text: string }> = {
  not_started: { label: 'Not Started', bg: 'var(--surface-2)',      text: 'var(--text-muted)' },
  in_progress: { label: 'In Progress', bg: 'rgba(59,130,246,0.10)', text: '#2563EB'           },
  almost_done: { label: 'Almost Done', bg: 'rgba(34,197,94,0.10)',  text: '#16A34A'           },
}

const SUBMISSION_STATUS: Record<'graded' | 'pending' | 'returned', { label: string; bg: string; text: string }> = {
  graded:   { label: 'Graded',   bg: 'rgba(34,197,94,0.10)',  text: '#16A34A' },
  pending:  { label: 'Pending',  bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
  returned: { label: 'Returned', bg: 'rgba(147,51,234,0.10)', text: '#7C3AED' },
}

const TEST_FORMAT: Record<'mcq' | 'essay' | 'mixed' | 'practical', { label: string; bg: string; text: string }> = {
  mcq:       { label: 'Multiple Choice', bg: 'rgba(59,130,246,0.10)', text: '#2563EB' },
  essay:     { label: 'Essay',            bg: 'rgba(147,51,234,0.10)', text: '#7C3AED' },
  mixed:     { label: 'Mixed',            bg: 'rgba(6,85,92,0.12)',    text: 'var(--accent)' },
  practical: { label: 'Practical',        bg: 'rgba(245,158,11,0.12)', text: '#D97706' },
}

export default function AssignmentAssessmentDefaultPage() {
  const { t } = useI18n()
  const [active, setActive] = useState<SectionId>('active')

  const { activeAssignments, submissions, upcomingTests } = useAssignmentAssessmentDefaultStore(
    useShallow((s) => ({
      activeAssignments: s.activeAssignments,
      submissions:       s.submissions,
      upcomingTests:     s.upcomingTests,
    })),
  )

  const NAV: NavItem[] = [
    { id: 'active',      label: 'Active Tasks',    icon: <HiOutlineClipboardDocumentList /> },
    { id: 'submissions', label: 'My Submissions',  icon: <HiOutlineDocumentText /> },
    { id: 'tests',       label: 'Upcoming Tests',  icon: <HiOutlinePencilSquare /> },
  ]
  const current = NAV.find((n) => n.id === active)!

  return (
    <div className="flex h-full min-h-0 gap-0">
      <aside className="w-[210px] shrink-0 flex flex-col pe-3 pt-1">
        <div className="mb-5 px-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em] mb-2">
            <HiOutlineClipboardDocumentList className="text-[11px]" />
            {t('nav.assignmentAssessment.title').toUpperCase()}
          </div>
          <h1 className="text-[15px] font-bold text-primary tracking-[-0.01em]">
            {t('nav.assignmentAssessment.title')}
          </h1>
          <p className="text-[11.5px] text-muted mt-0.5">{NAV.length} sections</p>
        </div>

        <nav className="flex flex-col gap-0.5 overflow-y-auto thin-scrollbar-light">
          {NAV.map((item) => {
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-[13px] font-medium w-full text-start border-none cursor-pointer transition-all duration-150"
                style={{
                  background: isActive ? 'var(--accent-light)' : 'transparent',
                  color:      isActive ? 'var(--accent)'       : 'var(--text-muted)',
                }}
              >
                <span className="text-[16px] shrink-0">{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      <div className="w-px bg-[var(--border)] self-stretch mx-1 shrink-0" />

      <div className="flex-1 min-w-0 ps-8 pt-1 overflow-y-auto thin-scrollbar-light pb-10 flex flex-col gap-4">
        <SectionHeader icon={current.icon} title={current.label} />

        {active === 'active' && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
            {activeAssignments.map((a) => {
              const st = ASSIGNMENT_STATUS[a.status]
              return (
                <div key={a.id} className="card px-5 py-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase mb-1">
                        {a.course}
                      </p>
                      <h3 className="text-[14px] font-bold text-primary leading-snug">{a.title}</h3>
                    </div>
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0"
                      style={{ background: st.bg, color: st.text }}
                    >
                      {st.label}
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[11.5px] text-muted">Progress</span>
                      <span className="text-[11.5px] font-bold text-accent">{a.progress}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${a.progress}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[12px] text-muted">
                      <HiOutlineClock className="text-[13px]" />
                      <span>Due in {a.dueIn}</span>
                    </div>
                    <button
                      className="text-[12px] font-semibold text-accent hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {active === 'submissions' && (
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
                My Submissions
              </p>
              <p className="text-[13px] text-secondary">
                {submissions.filter((s) => s.status === 'graded').length} graded ·{' '}
                {submissions.filter((s) => s.status === 'pending').length} pending ·{' '}
                {submissions.filter((s) => s.status === 'returned').length} returned
              </p>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]" style={{ background: 'var(--navy)' }}>
                  <th className="px-6 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Title</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Course</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Submitted</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Status</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Grade</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => {
                  const st = SUBMISSION_STATUS[s.status]
                  return (
                    <tr key={s.id} className={i > 0 ? 'border-t border-[var(--border)]' : ''}>
                      <td className="px-6 py-3.5 text-[13.5px] font-semibold text-primary">{s.title}</td>
                      <td className="px-4 py-3.5 text-[12.5px] text-secondary whitespace-nowrap">{s.course}</td>
                      <td className="px-4 py-3.5 text-[12.5px] text-muted whitespace-nowrap">{s.submittedAt}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background: st.bg, color: st.text }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[14px] font-bold text-primary">
                        {s.grade ?? <span className="text-muted text-[13px] font-normal">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {active === 'tests' && (
          <div className="flex flex-col gap-3">
            {upcomingTests.map((t) => {
              const f = TEST_FORMAT[t.format]
              return (
                <div key={t.id} className="card px-5 py-4 flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ background: f.bg, color: f.text }}
                  >
                    <HiOutlineBookOpen className="text-[20px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase">
                        {t.course}
                      </p>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold"
                        style={{ background: f.bg, color: f.text }}
                      >
                        {f.label}
                      </span>
                    </div>
                    <h3 className="text-[14px] font-bold text-primary">{t.title}</h3>
                    <p className="text-[11.5px] text-muted mt-0.5">
                      {t.date} · {t.duration}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
