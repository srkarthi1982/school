import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlineCalendar,
  HiOutlineAcademicCap,
  HiOutlineClipboardDocumentList,
  HiOutlineUserGroup,
  HiOutlineSparkles,
} from 'react-icons/hi2'
import { useI18n } from '../../infra/locales/I18nContext'
import SectionHeader from '../../infra/shared/components/SectionHeader'
import useDashboardSchedulingDefaultStore from './store'

type SectionId = 'today' | 'week' | 'upcoming'

interface NavItem { id: SectionId; label: string; icon: React.ReactNode }

const ACCENT_COLOR: Record<'teal' | 'blue' | 'amber' | 'purple', string> = {
  teal:   '#0D9488',
  blue:   '#2563EB',
  amber:  '#D97706',
  purple: '#7C3AED',
}

const ACCENT_BG: Record<'teal' | 'blue' | 'amber' | 'purple', string> = {
  teal:   'rgba(45,212,191,0.12)',
  blue:   'rgba(59,130,246,0.10)',
  amber:  'rgba(245,158,11,0.12)',
  purple: 'rgba(147,51,234,0.10)',
}

const EVENT_CONFIG: Record<'exam' | 'assignment' | 'meeting' | 'holiday', { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  exam:       { icon: <HiOutlineAcademicCap className="text-[15px]" />,           color: '#DC2626', bg: 'rgba(220,38,38,0.10)',  label: 'Exam'        },
  assignment: { icon: <HiOutlineClipboardDocumentList className="text-[15px]" />, color: '#2563EB', bg: 'rgba(59,130,246,0.10)', label: 'Assignment'  },
  meeting:    { icon: <HiOutlineUserGroup className="text-[15px]" />,              color: '#D97706', bg: 'rgba(245,158,11,0.10)', label: 'Meeting'     },
  holiday:    { icon: <HiOutlineSparkles className="text-[15px]" />,               color: '#16A34A', bg: 'rgba(34,197,94,0.10)',  label: 'Holiday'     },
}

export default function DashboardSchedulingDefaultPage() {
  const { t } = useI18n()
  const [active, setActive] = useState<SectionId>('today')

  const { todaySchedule, weeklyGrid, upcomingEvents, dateLabel } = useDashboardSchedulingDefaultStore(
    useShallow((s) => ({
      todaySchedule:  s.todaySchedule,
      weeklyGrid:     s.weeklyGrid,
      upcomingEvents: s.upcomingEvents,
      dateLabel:      s.dateLabel,
    })),
  )

  const NAV: NavItem[] = [
    { id: 'today',    label: "Today's Schedule", icon: <HiOutlineClock /> },
    { id: 'week',     label: 'Week View',        icon: <HiOutlineCalendar /> },
    { id: 'upcoming', label: 'Upcoming Events',  icon: <HiOutlineCalendarDays /> },
  ]
  const current = NAV.find((n) => n.id === active)!

  return (
    <div className="flex h-full min-h-0 gap-0">
      <aside className="w-[210px] shrink-0 flex flex-col pe-3 pt-1">
        <div className="mb-5 px-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em] mb-2">
            <HiOutlineCalendarDays className="text-[11px]" />
            {t('nav.dashboardScheduling').toUpperCase()}
          </div>
          <h1 className="text-[15px] font-bold text-primary tracking-[-0.01em]">
            {t('nav.dashboardScheduling')}
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
        <SectionHeader title={current.label} icon={current.icon} />

        {active === 'today' && (
          <div className="flex flex-col gap-4">
            <div
              className="rounded-[14px] px-6 py-5 text-white relative overflow-hidden"
              style={{ background: 'linear-gradient(130deg, var(--navy) 0%, var(--navy-mid) 100%)' }}
            >
              <p className="text-[11px] font-semibold text-white/60 tracking-[0.1em] uppercase mb-1.5">
                {dateLabel}
              </p>
              <h3 className="text-[22px] font-bold tracking-[-0.02em] mb-1">5 classes scheduled</h3>
              <p className="text-[13px] text-white/70">
                Starting at 08:00 in Lab B-204 with Computer Science.
              </p>
            </div>

            <div className="card p-0 overflow-hidden">
              <div className="flex flex-col">
                {todaySchedule.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-4 px-6 py-4 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                  >
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ background: ACCENT_COLOR[s.accent] }}
                    />
                    <div
                      className="px-3 py-2 rounded-[9px] shrink-0 min-w-[110px]"
                      style={{ background: ACCENT_BG[s.accent], color: ACCENT_COLOR[s.accent] }}
                    >
                      <p className="text-[12px] font-bold">{s.time}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-primary">{s.subject}</p>
                      <p className="text-[12px] text-muted mt-0.5">
                        {s.room} · {s.teacher}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {active === 'week' && (
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
                Week 17 — April 2026
              </p>
              <p className="text-[15px] font-bold text-primary">Three-slot daily grid</p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-2">
                <div />
                <div className="text-[10.5px] font-bold text-muted tracking-[0.07em] uppercase text-center pb-2">Slot 1</div>
                <div className="text-[10.5px] font-bold text-muted tracking-[0.07em] uppercase text-center pb-2">Slot 2</div>
                <div className="text-[10.5px] font-bold text-muted tracking-[0.07em] uppercase text-center pb-2">Slot 3</div>
                {weeklyGrid.map((row) => (
                  <div key={row.day} className="contents">
                    <div className="text-[12px] font-bold text-primary flex items-center justify-center">
                      {row.day}
                    </div>
                    {[row.slot1, row.slot2, row.slot3].map((slot, idx) => (
                      <div
                        key={idx}
                        className="h-12 rounded-[9px] flex items-center justify-center text-[12px] font-semibold"
                        style={{
                          background: slot ? 'var(--accent-light)' : 'var(--surface-2)',
                          color: slot ? 'var(--accent)' : 'var(--text-muted)',
                          border: slot ? 'none' : '1px dashed var(--border)',
                        }}
                      >
                        {slot ?? '—'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {active === 'upcoming' && (
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <p className="text-[11px] font-bold text-muted tracking-[0.07em] uppercase mb-0.5">
                Next 14 days
              </p>
              <p className="text-[13px] text-secondary">Exams, assignments, meetings, and holidays.</p>
            </div>
            <ul className="flex flex-col">
              {upcomingEvents.map((e, i) => {
                const c = EVENT_CONFIG[e.type]
                return (
                  <li
                    key={e.id}
                    className={`flex items-center gap-4 px-6 py-3.5 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}
                  >
                    <div className="flex flex-col items-center justify-center w-12 shrink-0">
                      <p className="text-[10.5px] font-bold text-muted tracking-[0.07em] uppercase">
                        {e.day}
                      </p>
                      <p className="text-[20px] font-bold text-primary leading-none">{e.date}</p>
                    </div>
                    <div
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                      style={{ background: c.bg, color: c.color }}
                    >
                      {c.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-primary">{e.title}</p>
                      <p className="text-[11.5px] text-muted mt-0.5">{c.label}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
