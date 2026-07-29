import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineChartBarSquare,
  HiOutlineClipboardDocumentCheck,
  HiOutlineAcademicCap,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineMinus,
  HiMiniCalendarDays,
  HiQueueList,
} from 'react-icons/hi2'
import { useI18n } from '../../infra/locales/I18nContext'
import SectionHeader from '../../infra/shared/components/SectionHeader'
import useGradingAttendanceDefaultStore from './store'
import Attendance from './components/Attendance'
import useAuthStore, { selectUser, selectUserPermissions } from '../../infra/auth/useAuthStore';
import type { PermissionCode, } from '../../infra/shared/types/permissions';

type SectionId = 'grades' | 'attendance-month' | 'records' | 'daily-attendance' | 'class-attendance'

interface NavItem { id: SectionId; label: string; icon: React.ReactNode }

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  present: { bg: 'rgba(34,197,94,0.15)', text: '#16A34A', label: 'Present' },
  absent: { bg: 'rgba(220,38,38,0.12)', text: '#DC2626', label: 'Absent' },
  late: { bg: 'rgba(245,158,11,0.15)', text: '#D97706', label: 'Late' },
  excused: { bg: 'rgba(59,130,246,0.12)', text: '#2563EB', label: 'Excused' },
  off: { bg: 'var(--surface-2)', text: 'var(--text-muted)', label: '—' },
}

export default function GradingAttendanceDefaultPage() {
  console.log('GradingAttendanceDefaultPage')
  const { t } = useI18n()
  const [active, setActive] = useState<SectionId>('grades')

  const user = useAuthStore(selectUser);
  const permissions = useAuthStore(selectUserPermissions) as unknown as Set<PermissionCode>;
  const userId = (permissions.has('attendance:write') ? 0 : (user?.id || 0));
  const { grades, attendanceMonth, attendanceRecords, stats, onAttendanceTypeChanged } = useGradingAttendanceDefaultStore(
    useShallow((s) => ({
      grades: s.grades,
      attendanceMonth: s.attendanceMonth,
      attendanceRecords: s.attendanceRecords,
      stats: s.stats,
      onAttendanceTypeChanged: s.onAttendanceTypeChanged
    })),
  )

  const NAV: NavItem[] = [
    { id: 'grades', label: 'My Grades', icon: <HiOutlineAcademicCap /> },
    { id: 'attendance-month', label: 'Attendance Month', icon: <HiOutlineChartBarSquare /> },
    { id: 'records', label: 'Recent Records', icon: <HiOutlineClipboardDocumentCheck /> },
    { id: 'daily-attendance', label: 'Daily Attendance', icon: <HiQueueList /> },
    { id: 'class-attendance', label: 'Class Attendance', icon: <HiMiniCalendarDays /> }
  ]
  const current = NAV.find((n) => n.id === active)!

  return (
    <div className="flex h-full min-h-0 gap-0">
      <aside className="w-[210px] shrink-0 flex flex-col pe-3 pt-1">
        <div className="mb-5 px-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em] mb-2">
            <HiOutlineChartBarSquare className="text-[11px]" />
            {t('nav.gradingAttendance').toUpperCase()}
          </div>
          <h1 className="text-[15px] font-bold text-primary tracking-[-0.01em]">
            {t('nav.gradingAttendance')}
          </h1>
          <p className="text-[11.5px] text-muted mt-0.5">{NAV.length} sections</p>
        </div>

        <nav className="flex flex-col gap-0.5 overflow-y-auto thin-scrollbar-light">
          {NAV.map((item) => {
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                onClick={async () => {
                  setActive(item.id);
                  if (item.id === 'daily-attendance' || item.id === 'class-attendance') await onAttendanceTypeChanged(item.id, userId);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-[9px] text-[13px] font-medium w-full text-start border-none cursor-pointer transition-all duration-150"
                style={{
                  background: isActive ? 'var(--accent-light)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
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

        {active === 'grades' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              <StatCard label="Average Grade" value={stats.averageGrade} accent />
              <StatCard label="Present Rate" value={`${stats.presentRate}%`} />
              <StatCard label="Absences" value={String(stats.absentCount)} />
              <StatCard label="Late" value={String(stats.lateCount)} />
            </div>

            <div className="card p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--border)]">
                <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
                  Subjects
                </p>
                <p className="text-[13px] text-secondary">
                  Your current grade across enrolled subjects this semester.
                </p>
              </div>
              <div className="flex flex-col">
                {grades.map((g, i) => {
                  const trendIcon =
                    g.trend === 'up' ? <HiOutlineArrowTrendingUp className="text-[14px] text-[#16A34A]" />
                      : g.trend === 'down' ? <HiOutlineArrowTrendingDown className="text-[14px] text-[#DC2626]" />
                        : <HiOutlineMinus className="text-[14px] text-muted" />
                  return (
                    <div
                      key={g.id}
                      className={`flex items-center gap-4 px-6 py-3.5 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                    >
                      <div
                        className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                        style={{ background: 'var(--navy)' }}
                      >
                        {g.code.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-semibold text-primary">{g.subject}</p>
                        <p className="text-[11.5px] text-muted mt-0.5">{g.code}</p>
                      </div>
                      <div className="flex-1 max-w-[180px]">
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${g.percent}%` }} />
                        </div>
                        <p className="text-[11px] text-muted mt-1 text-end">{g.percent}%</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {trendIcon}
                        <span className="text-[16px] font-bold text-primary w-8 text-end">{g.grade}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {active === 'attendance-month' && (
          <div className="card px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
                  April 2026
                </p>
                <p className="text-[15px] font-bold text-primary">Monthly Attendance</p>
              </div>
              <div className="flex gap-3 flex-wrap">
                {(['present', 'late', 'absent', 'excused'] as const).map((k) => {
                  const c = STATUS_COLORS[k]
                  return (
                    <div key={k} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.text }} />
                      <span className="text-[11.5px] text-muted">{c.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div
                  key={i}
                  className="text-[10.5px] font-bold text-muted text-center tracking-[0.06em] uppercase pb-1"
                >
                  {d}
                </div>
              ))}
              {attendanceMonth.map((d) => {
                const c = STATUS_COLORS[d.status]
                return (
                  <div
                    key={d.date}
                    className="aspect-square rounded-[8px] flex items-center justify-center text-[12px] font-semibold"
                    style={{ background: c.bg, color: c.text }}
                    title={c.label}
                  >
                    {d.date}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {active === 'records' && (
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
                Recent Attendance
              </p>
              <p className="text-[13px] text-secondary">
                Your last {attendanceRecords.length} attendance records across all subjects.
              </p>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]" style={{ background: 'var(--navy)' }}>
                  <th className="px-6 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Subject</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Date</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Status</th>
                  <th className="px-4 py-3 text-[11px] font-bold text-white/60 tracking-[0.06em] uppercase">Note</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.map((r, i) => {
                  const c = STATUS_COLORS[r.status]
                  return (
                    <tr
                      key={r.id}
                      className={i > 0 ? 'border-t border-[var(--border)]' : ''}
                    >
                      <td className="px-6 py-3.5 text-[13.5px] font-semibold text-primary">{r.subject}</td>
                      <td className="px-4 py-3.5 text-[13px] text-secondary whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background: c.bg, color: c.text }}
                        >
                          {c.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[12.5px] text-muted">{r.note ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {
          ['daily-attendance', 'class-attendance'].includes(active) && <Attendance user={user} userId={userId} permissions={permissions} />
        }
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-1">{label}</p>
      <p
        className="text-[22px] font-bold leading-tight tracking-[-0.01em]"
        style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}
