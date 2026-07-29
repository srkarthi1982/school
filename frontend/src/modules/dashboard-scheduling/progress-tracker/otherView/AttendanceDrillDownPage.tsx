import { useMemo, useState, useEffect, type ReactNode, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useI18n, ValidTranslationKeys } from '../../../../infra/locales/I18nContext'
import useProgressStore, { type StudentAttendanceRecord } from '../store'
import { HiOutlineArrowLeft, HiChevronLeft, HiChevronRight } from 'react-icons/hi2'
import { DAYS_OF_WEEK, ATTENDANCE_STATUS_COLORS as STATUS_COLORS, getColorById } from '../utils'

const tk = (k: string) => k as any

type DrillViewMode = 'overview' | 'student-detail' | 'lesson-overview'

// Parse date string "YYYY-MM-DD" to Date
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// Student-detail calendar (extracted so hooks are called unconditionally)
// ---------------------------------------------------------------------------
function StudentDetail({ selectedStudentId, studentAttendance, courseDateRanges, holidays, courses, allRecords, studentStats, onBack }: {
  selectedStudentId: number
  studentAttendance: StudentAttendanceRecord[]
  courseDateRanges: Record<number, { start_date: string | null; end_date: string | null }>
  holidays: string[]
  courses: { courseId: number; courseName: string; teacherName: string }[]
  allRecords: StudentAttendanceRecord[]
  studentStats: Map<number, { attendanceRate: number; presentCount: number; absentCount: number; excusedCount: number; lateCount: number; simulationCount: number; flyingCount: number }>
  onBack: () => void
}) {
  const { t } = useI18n()
  const holidaySet = useMemo(() => new Set(holidays), [holidays])

  const studentName = (() => {
    const rec = allRecords.find(r => r.studentId === selectedStudentId)
    return rec?.studentName ?? `Student ${selectedStudentId}`
  })()
  const studentRecords = allRecords.filter(r => r.studentId === selectedStudentId)
  const courseIds = [...new Set(studentRecords.map(r => r.courseId))]

  if (courseIds.length === 0) return null

  const courseId = courseIds[0]
  const course = courses.find(c => c.courseId === courseId)

  const stats = studentStats.get(selectedStudentId) ?? { attendanceRate: 0, presentCount: 0, absentCount: 0, excusedCount: 0, lateCount: 0, simulationCount: 0, flyingCount: 0 }
  const rate = Math.round(stats.attendanceRate)

  // Use backend-provided presentCount directly instead of recomputing
  const presentCount = stats.presentCount
  const totalAttendance = presentCount + stats.absentCount

  // Date range from studentRecords (only selected student's dates)
  const range = useMemo(() => {
    if (studentRecords.length === 0) return null
    let earliestStart: Date | null = null
    let latestEnd: Date | null = null
    for (const r of studentRecords) {
      const rng = courseDateRanges[r.courseId]
      if (rng?.start_date && rng?.end_date) {
        const rngStart = parseDate(rng.start_date)
        const rngEnd = parseDate(rng.end_date)
        if (!earliestStart || rngStart < earliestStart) earliestStart = rngStart
        if (!latestEnd || rngEnd > latestEnd) latestEnd = rngEnd
      }
    }
    if (!earliestStart || !latestEnd) return null
    return { start: earliestStart, end: latestEnd }
  }, [studentRecords, courseDateRanges])

  const todayStr = useMemo(() => dateStr(new Date()), [])

  // Build a map of absent dates for this student from allRecords only
  const allAbsentDates = useMemo(() => {
    const m = new Map<string, string>()
    studentRecords.forEach(r => {
      if (r.status !== 'present') {
        m.set(r.date, r.status)
      }
    })
    return m
  }, [studentRecords])
  const calendarCells = useMemo(() => {
    if (!range?.start || !range?.end) return []
    const cells: Array<{ date: string; day: number; month: number; year: number; isWeekend: boolean; isHoliday: boolean; status: string | null }> = []
    let current = range.start
    while (current <= range.end) {
      const iso = dateStr(current)
      if (iso > todayStr) break
      const dayOfWeek = current.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      const isHoliday = holidaySet.has(iso)
      const status = allAbsentDates.get(iso) ?? null
      cells.push({
        date: iso,
        day: current.getDate(),
        month: current.getMonth(),
        year: current.getFullYear(),
        isWeekend,
        isHoliday,
        status,
      })
      current = addDays(current, 1)
    }
    return cells
  }, [range, allAbsentDates, holidaySet, todayStr])

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  // Group cells by month
  const monthGroups = useMemo(() => {
    const groups: Array<{ month: number; year: number; days: typeof calendarCells; padding: number }> = []
    let currentMonth = -1
    let currentYear = -1
    for (let i = 0; i < calendarCells.length; i++) {
      const cell = calendarCells[i]
      if (cell.month !== currentMonth || cell.year !== currentYear) {
        // Calculate padding for the first day of this month
        const jsDay = new Date(cell.year, cell.month, 1).getDay()
        const padding = (jsDay - 1 + 7) % 7
        groups.push({ month: cell.month, year: cell.year, days: [cell], padding })
        currentMonth = cell.month
        currentYear = cell.year
      } else {
        groups[groups.length - 1].days.push(cell)
      }
    }
    return groups
  }, [calendarCells])

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary mb-4 transition-colors">
        <HiOutlineArrowLeft className="text-[14px]" />
        {t(tk('progress.attendanceTracking'))}
      </button>
      {course && (
        <div className="mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[8px] flex items-center justify-center text-[16px] font-bold text-white shrink-0" style={{ background: getColorById(course.courseId) }}>
            {course.courseName.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">{course.courseName}</h2>
            <p className="text-[12px] text-muted">{t(tk('progress.teacherStudentName'))}: {studentName}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="card px-5 py-4">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(tk('progress.attendanceRate'))}</p>
          <p className="text-2xl font-bold text-accent">{rate}%</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(tk('progress.daysPresent'))}</p>
          <p className="text-2xl font-bold" style={{ color: STATUS_COLORS.present.text }}>{presentCount}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(tk('progress.totalAttendance'))}</p>
          <p className="text-2xl font-bold" style={{ color: STATUS_COLORS.absent.text }}>{totalAttendance}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(`progress.simulation` as any)}</p>
          <p className="text-2xl font-bold" style={{ color: STATUS_COLORS.simulation.text }}>{stats.simulationCount}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(`progress.flying` as any)}</p>
          <p className="text-2xl font-bold" style={{ color: STATUS_COLORS.flying.text }}>{stats.flyingCount}</p>
        </div>
      </div>

      <div className="card px-5 py-5">
        <p className="text-[12px] font-bold text-primary mb-3">{t(tk('progress.attendanceTracking'))}</p>
        {monthGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-5 pt-4 border-t border-bd' : undefined}>
            <p className="text-[11px] font-semibold text-secondary mb-2">{monthNames[group.month]} {group.year}</p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAYS_OF_WEEK.map((d, i) => (
                <div key={i} className="text-[10px] font-bold text-muted text-center tracking-[0.05em] uppercase pb-1">{d}</div>
              ))}
              {Array.from({ length: group.padding }, (_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ))}
              {group.days.map(cell => {
                if (cell.isHoliday && !cell.isWeekend) {
                  return (
                    <div
                      key={cell.date}
                      className="aspect-square rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold select-none"
                      style={{ opacity: 0.5, background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                      title={`${cell.day} - Holiday`}
                    >
                      <span className="text-[12px] leading-none">{cell.day}</span>
                      <span className="text-[8px] leading-none mt-[1px]">H</span>
                    </div>
                  )
                }
                if (cell.isWeekend) {
                  return (
                    <div
                      key={cell.date}
                      className="aspect-square rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold select-none"
                      style={{ opacity: 0.5, background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                      title={`${cell.day} - Weekend`}
                    >
                      <span className="text-[12px] leading-none">{cell.day}</span>
                      <span className="text-[8px] leading-none mt-[1px]">W</span>
                    </div>
                  )
                }
                if (!cell.status) {
                  return (
                    <div
                      key={cell.date}
                      className="aspect-square rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold select-none"
                      style={{ background: STATUS_COLORS.present.bg, color: STATUS_COLORS.present.text }}
                      title={`${cell.day} - Present (no record)`}
                    >
                      <span className="text-[12px] leading-none">{cell.day}</span>
                      <span className="text-[8px] leading-none mt-[1px]">P</span>
                    </div>
                  )
                }
                const c2 = STATUS_COLORS[cell.status] ?? STATUS_COLORS.absent
                const initial = cell.status === 'present' ? 'P' : cell.status === 'absent' ? 'A' : cell.status === 'late' ? 'L' : cell.status === 'excused' ? 'E' : cell.status === 'simulation' ? 'S' : 'F'
                return (
                  <div
                    key={cell.date}
                    className="aspect-square rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold select-none"
                    style={{ background: c2.bg, color: c2.text }}
                    title={`${cell.day} - ${cell.status}`}
                  >
                    <span className="text-[12px] leading-none">{cell.day}</span>
                    <span className="text-[8px] leading-none mt-[1px]">{initial}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AttendanceDrillDown({ title, description, icon, onBack }: { title: string; description: string; icon: ReactNode; onBack: () => void }) {
  const { t } = useI18n()
  const studentAttendance = useProgressStore(useShallow(s => s.studentAttendance))
  const courses = useProgressStore(useShallow(s => s.teacherCourses))
  const courseDateRanges = useProgressStore(useShallow(s => s.courseDateRanges))
  const holidays = useProgressStore(useShallow(s => s.holidays))
  const holidaySet = useMemo(() => new Set(holidays), [holidays])
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<DrillViewMode>('overview')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [totalRecords, setTotalRecords] = useState(0)
  const drilldownLoading = useProgressStore(useShallow(s => s.drilldownLoading?.attendance ?? false))
  const aggregatedStats = useProgressStore(useShallow(s => s.attendanceAggregatedStats))

  const handleSelectCourse = useCallback((courseId: number | null) => {
    setSelectedCourseId(courseId)
    setPage(1)
  }, [])

  const handleSelectStatus = useCallback((status: string | null) => {
    setSelectedStatus(status)
    setPage(1)
  }, [])

  useEffect(() => {
    useProgressStore.getState().fetchTeacherDrilldown('attendance', { course_id: selectedCourseId, status: selectedStatus })
  }, [selectedCourseId, selectedStatus])

  const allRecords = studentAttendance

  const uniqueCourseIds = useMemo(() => courses.map(c => c.courseId), [courses])

  // Stats are now in each record from backend - get first record per student
  const studentStatsById = useMemo(() => {
    const m = new Map<number, { attendanceRate: number; presentCount: number; absentCount: number; excusedCount: number; lateCount: number; simulationCount: number; flyingCount: number }>()
    allRecords.forEach(r => {
      if (!m.has(r.studentId)) {
        m.set(r.studentId, {
          attendanceRate: r.attendanceRate ?? 0,
          presentCount: r.presentCount ?? 0,
          absentCount: r.absentCount ?? 0,
          excusedCount: r.excusedCount ?? 0,
          lateCount: r.lateCount ?? allRecords.filter(x => x.studentId === r.studentId && x.status === 'late').length,
          simulationCount: r.simulationCount ?? allRecords.filter(x => x.studentId === r.studentId && x.status === 'simulation').length,
          flyingCount: r.flyingCount ?? allRecords.filter(x => x.studentId === r.studentId && x.status === 'flying').length,
        })
      }
    })
    return m
  }, [allRecords])

  function getStudentName(id: number): string {
    const rec = allRecords.find(r => r.studentId === id)
    return rec?.studentName ?? `Student ${id}`
  }

  return (
    <div >
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary transition-colors">
          <HiOutlineArrowLeft className="text-[14px]" />
          {t(tk('progress.backToOverview'))}
        </button>
      </div>

      {drilldownLoading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-muted text-[13px]">Loading...</p>
        </div>
      ) : (
        <>
        {viewMode === 'overview' && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] bg-accent-light text-accent shrink-0">
              {icon}
            </div>
            <h1 className="text-2xl font-bold text-primary tracking-[-0.02em]">{title}</h1>
          </div>
          <p className="text-[13px] text-muted ml-12 mb-6">{description}</p>

          {/* Course filter */}
          <div className="mb-3">
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.course'))}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSelectCourse(null)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
                  !selectedCourseId
                    ? 'bg-accent-light text-accent border-accent/30'
                    : 'text-muted hover:border-accent/30'
                }`}
              >
                {t(tk('progress.assessmentAll'))}
              </button>
              {uniqueCourseIds.map(courseId => {
                const course = courses.find(c => c.courseId === courseId)
                if (!course) return null
                return (
                  <button
                    key={courseId}
                    onClick={() => handleSelectCourse(courseId)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
                      selectedCourseId === courseId
                        ? 'bg-accent-light text-accent border-accent/30'
                        : 'text-muted hover:border-accent/30'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getColorById(course.courseId) }} />
                    {course.courseName}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status filter - backend filtered, counts reflect current filters */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSelectStatus(null)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
                  !selectedStatus
                    ? 'bg-accent-light text-accent border-accent/30'
                    : 'text-muted hover:border-accent/30'
                }`}
              >
                {t(tk('progress.assessmentAll'))}
              </button>
              {Object.keys(STATUS_COLORS).map(status => (
                <button
                  key={status}
                  onClick={() => handleSelectStatus(status === selectedStatus ? null : status)}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full border border-bd transition-colors"
                  style={{ background: selectedStatus === status ? STATUS_COLORS[status].bg : 'transparent', color: selectedStatus === status ? STATUS_COLORS[status].text : 'var(--text-muted)' }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[status].text }} />
                  {t(`progress.${status}` as any)}
                </button>
              ))}
            </div>
          </div>

          {/* Active filter reset */}
          {(selectedCourseId || selectedStatus) && (
            <button
              onClick={() => { setSelectedCourseId(null); setSelectedStatus(null); setPage(1) }}
              className="mb-4 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
            >
              {t(tk('progress.assessmentResetFilters'))}
            </button>
          )}

          {/* Quick stats - backend computed (only affected by course filter, not status filter) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Object.keys(STATUS_COLORS).map(status => {
              const c = STATUS_COLORS[status]
              const count = aggregatedStats[status as keyof typeof aggregatedStats] ?? 0
              return (
                <div key={status} className="card px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: c.text }} />
                    <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(`progress.${status}` as any)}</p>
                  </div>
                  <p className="text-xl font-bold" style={{ color: c.text }}>{count}</p>
                </div>
              )
            })}
          </div>

          {/* Student list table with pagination */}
          {studentAttendance.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-muted text-[13px]">{t(tk('progress.noAttendanceRecords'))}</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-start">
                <thead>
                  <tr style={{ background: 'var(--navy)' }}>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Student</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('course'))}</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.attendanceRate'))}</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Present</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Absent</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Late</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Excused</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Simulation</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">Flying</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const allStudentIds = [...new Set(allRecords.map(r => r.studentId))]
                    const itemsPerPage = 50
                    const start = (page - 1) * itemsPerPage
                    const end = start + itemsPerPage
                    const pageItems = allStudentIds.slice(start, end)
                    return pageItems.map(s => {
                      const stats = studentStatsById.get(s) ?? { attendanceRate: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, simulationCount: 0, flyingCount: 0 }
                      const rate = Math.round(stats.attendanceRate)
                      const { presentCount, absentCount, lateCount, excusedCount } = stats
                      const studentRecords = allRecords.filter(r => r.studentId === s)
                      const courseIds = [...new Set(studentRecords.map(r => r.courseId))]
                      return (
                        <tr
                          key={s}
                          className="border-b border-bd hover:bg-surface-2 transition-colors cursor-pointer"
                          onClick={() => { setSelectedStudentId(s); setViewMode('student-detail') }}
                        >
                          <td className="px-4 py-3 text-[12.5px] font-medium text-primary">{getStudentName(s)}</td>
                          <td className="px-4 py-3 text-[12px] text-primary">
                            {(() => {
                              if (courseIds.length === 0) return t(tk('progress.assessmentAll'))
                              if (courseIds.length === 1) {
                                const course = courses.find(c => c.courseId === courseIds[0])
                                if (!course) return courseIds[0].toString()
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getColorById(courseIds[0]) }} />
                                    {course.courseName}
                                  </div>
                                )
                              }
                              return `${courseIds.length} courses`
                            })()}
                          </td>
                          <td className="px-4 py-3 text-[12px] font-bold" style={{ color: rate >= 80 ? STATUS_COLORS.present.text : rate >= 60 ? STATUS_COLORS.late.text : STATUS_COLORS.absent.text }}>{rate}%</td>
                          <td className="px-4 py-3 text-[12px]" style={{ color: STATUS_COLORS.present.text }}>{presentCount}</td>
                          <td className="px-4 py-3 text-[12px]" style={{ color: STATUS_COLORS.absent.text }}>{absentCount}</td>
                          <td className="px-4 py-3 text-[12px]" style={{ color: STATUS_COLORS.late.text }}>{lateCount}</td>
                          <td className="px-4 py-3 text-[12px]" style={{ color: STATUS_COLORS.excused.text }}>{excusedCount}</td>
                          <td className="px-4 py-3 text-[12px]" style={{ color: STATUS_COLORS.simulation.text }}>{stats.simulationCount}</td>
                          <td className="px-4 py-3 text-[12px]" style={{ color: STATUS_COLORS.flying.text }}>{stats.flyingCount}</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination controls */}
          {(() => {
            const allStudentIds = [...new Set(allRecords.map(r => r.studentId))]
            const pgs = Math.ceil(allStudentIds.length / 50)
            if (pgs <= 1) return null
            return (
              <div className="flex items-center justify-between mt-4">
                <p className="text-[12px] text-muted">Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, allStudentIds.length)} of {allStudentIds.length}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded border border-bd text-muted disabled:opacity-40 hover:text-primary transition-colors"
                  >
                    <HiChevronLeft className="text-[12px]" />
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-[11px] text-primary">{page} / {pgs}</span>
                  <button
                    onClick={() => setPage(p => Math.min(pgs, p + 1))}
                    disabled={page === pgs}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium rounded border border-bd text-muted disabled:opacity-40 hover:text-primary transition-colors"
                  >
                    Next
                    <HiChevronRight className="text-[12px]" />
                  </button>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {viewMode === 'student-detail' && selectedStudentId && (
        <StudentDetail
          selectedStudentId={selectedStudentId}
          studentAttendance={studentAttendance}
          courseDateRanges={courseDateRanges}
          holidays={holidays}
          courses={courses}
          allRecords={allRecords}
          studentStats={studentStatsById}
          onBack={() => setViewMode('overview')}
        />
      )}
        </>
      )}
    </div>
  )
}
