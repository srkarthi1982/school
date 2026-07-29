import { useMemo, useState, useEffect, type ReactNode, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useI18n, ValidTranslationKeys } from '../../../../infra/locales/I18nContext'
import useProgressStore, { AttendanceRecord } from '../store'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import { DAYS_OF_WEEK, ATTENDANCE_STATUS_COLORS as STATUS_COLORS, isActive, jsDayToGridIdx } from '../utils'

const tk = (k: string) => k as any
type DrillViewMode = 'overview' | 'lesson-detail'

function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export default function StudentAttendanceDrillDown({ title, description, icon, onBack }: { title: string; description: string; icon: ReactNode; onBack: () => void }) {
  const { t } = useI18n()
  const attendanceRecords = useProgressStore(useShallow(s => s.attendance))
  const courses = useProgressStore(useShallow(s => s.courses))
  const holidays = useProgressStore(useShallow(s => s.holidays))
  const studentStats = useProgressStore(useShallow(s => s.studentStats))
  const holidaySet = useMemo(() => new Set(holidays), [holidays])
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [viewMode, setViewMode] = useState<DrillViewMode>('overview')
  const drilldownLoading = useProgressStore(useShallow(s => s.drilldownLoading?.attendance))

  const handleSelectStatus = useCallback((status: string | null) => {
    setSelectedStatus(status)
  }, [])

  useEffect(() => {
    useProgressStore.getState().fetchStudentDrilldown('attendance', { status: selectedStatus || undefined, course_id: selectedLessonId || undefined })
  }, [selectedStatus, selectedLessonId])

  const todayStr = useMemo(() => dateStr(new Date()), [])

  const monthKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const r of attendanceRecords) {
      keys.add(r.date.slice(0, 7))
    }
    return Array.from(keys).sort()
  }, [attendanceRecords])

  useEffect(() => {
    if (monthKeys.length > 0 && !selectedMonth) {
      setSelectedMonth(monthKeys[monthKeys.length - 1])
    }
  }, [monthKeys])

  const monthRecords = useMemo(() => {
    return attendanceRecords.filter(r => r.date.startsWith(selectedMonth))
  }, [attendanceRecords, selectedMonth])

  // Build grid with all days in month, marking weekends/holidays
  const gridDays = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const jsDayIdx = new Date(year, month - 1, 1).getDay()
    const firstDayIdx = (jsDayIdx - 1 + 7) % 7
    const daysInMonth = new Date(year, month, 0).getDate()
    const byDate = new Map<string, string>()
    for (const r of monthRecords) {
      if (!byDate.has(r.date)) byDate.set(r.date, r.status)
    }
    const arr: Array<{ date: string | null; isWeekend: boolean; isHoliday: boolean }> = []
    for (let i = 0; i < firstDayIdx; i++) arr.push({ date: null, isWeekend: false, isHoliday: false })
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateObj = new Date(year, month - 1, dayNum)
      const jsDayOfWeek = dateObj.getDay()
      const isWeekend = jsDayOfWeek === 0 || jsDayOfWeek === 6
      const dateStrVal = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      const isHoliday = holidaySet.has(dateStrVal)
      // Cap at today - don't show future days as present
      const isFuture = dateStrVal > todayStr
      arr.push({
        date: isFuture ? `__future__${dateStrVal}` : (byDate.has(dateStrVal) ? dateStrVal : (isWeekend || isHoliday ? dateStrVal : dateStrVal)),
        isWeekend: isWeekend || isFuture,
        isHoliday: isHoliday,
      })
    }
    return arr
  }, [selectedMonth, monthRecords, holidaySet, todayStr])

  const selectedLesson = useMemo(() => {
    if (!selectedLessonId) return null
    return courses.find(c => c.courseId === selectedLessonId)
  }, [selectedLessonId, courses])

  const lessonRecords = useMemo(() => {
    if (!selectedLessonId) return []
    return attendanceRecords.filter(r => r.courseId === selectedLessonId && r.date.startsWith(selectedMonth))
  }, [selectedLessonId, attendanceRecords, selectedMonth])

  // Attendance rate from backend (already computed globally across all courses)
  const courseAttendanceRate = useMemo(() => {
    if (!selectedLessonId) return 0
    return courses.find(c => c.courseId === selectedLessonId)?.attendanceRate ?? 0
  }, [selectedLessonId, courses])

  // Get current student's global stats from backend (student view has only one student)
  const currentStudentStats = useMemo(() => {
    const keys = Object.keys(studentStats)
    if (keys.length === 0) return null
    const firstKey = keys[0]
    return studentStats[Number(firstKey)] ?? null
  }, [studentStats])

  // Month-specific present count (for the calendar grid, not for overall stats)
  const monthPresentCount = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    let presentCount = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (ds > todayStr) break
      const dateObj = new Date(year, month - 1, d)
      const dayOfWeek = dateObj.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) continue
      if (holidaySet.has(ds)) continue
      const rec = attendanceRecords.find(r => r.date === ds && r.status !== 'present')
      if (!rec) presentCount++
    }

    return presentCount
  }, [selectedMonth, todayStr, holidaySet, attendanceRecords])

  // Use backend attendance rate for consistency with overview
  const effectiveAttendanceRate = useMemo(() => {
    if (courses.length === 0) return 0
    if (viewMode === 'lesson-detail' && selectedLessonId) {
      return courses.find(c => c.courseId === selectedLessonId)?.attendanceRate ?? 0
    }
    return currentStudentStats?.attendanceRate ?? 0
  }, [courses, viewMode, selectedLessonId, currentStudentStats])

  function monthName(mk: string): string {
    const [year, month] = mk.split('-').map(Number)
    return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  function getStatusInitial(status: string): string {
    return status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'late' ? 'L' : status === 'excused' ? 'E' : status === 'simulation' ? 'S' : 'F'
  }

  const totalMonthRecords = attendanceRecords.filter(r => r.date.startsWith(selectedMonth))
  const totalAbsent = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    let absentCount = 0

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (ds > todayStr) break
      const dateObj = new Date(year, month - 1, d)
      const dayOfWeek = dateObj.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) continue
      if (holidaySet.has(ds)) continue
      const rec = attendanceRecords.find(r => r.date === ds && r.status !== 'present')
      if (rec) absentCount++
    }

    return absentCount
  }, [selectedMonth, todayStr, holidaySet, attendanceRecords])

  if (drilldownLoading) {
    return (
      <div className="ps-8 pt-1 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary transition-colors">
            <HiOutlineArrowLeft className="text-[14px]" />
            {t(tk('progress.backToOverview'))}
          </button>
        </div>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted text-[13px]">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ps-8 pt-1 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary transition-colors">
          <HiOutlineArrowLeft className="text-[14px]" />
          {t(tk('progress.backToOverview'))}
        </button>
      </div>

      {viewMode === 'overview' && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] bg-accent-light text-accent shrink-0">
              {icon}
            </div>
            <h1 className="text-2xl font-bold text-primary tracking-[-0.02em]">{title}</h1>
          </div>
          <p className="text-[13px] text-muted ml-12 mb-6">{description}</p>

          {/* Lesson filter */}
          <div className="mb-3">
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.course'))}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedLessonId(null)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
                  !selectedLessonId ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'
                }`}
              >
                {t(tk('progress.assessmentAll'))}
              </button>
              {courses.map(course => (
                <button
                  key={course.courseId}
                  onClick={() => setSelectedLessonId(course.courseId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
                    selectedLessonId === course.courseId ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: course.color }} />
                  {course.courseName}
                </button>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setSelectedStatus(null)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
                isActive(null, selectedStatus) ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'
              }`}
            >
              All ({totalMonthRecords.length})
            </button>
            {Object.keys(STATUS_COLORS).map(status => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status === selectedStatus ? null : status)}
                className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full border border-bd transition-colors ${
                  isActive(status, selectedStatus) ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[status].text }} />
                {t(`progress.${status}` as any)} ({totalMonthRecords.filter(r => r.status === status).length})
              </button>
            ))}
          </div>

          {/* Calendar container */}
          <div className="flex flex-wrap gap-4 mb-4 items-center">
            {monthKeys.map(mk => (
              <button
                key={mk}
                onClick={() => setSelectedMonth(mk)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
                  isActive(mk, selectedMonth) ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'
                }`}
              >
                {monthName(mk)}
              </button>
            ))}
          </div>

          {totalMonthRecords.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-muted text-[13px]">{t(tk('progress.noAttendanceRecords'))}</p>
            </div>
          ) : (
            <div className="card px-5 py-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] font-bold text-primary">
                  {monthPresentCount >= 0 ? `${monthName(selectedMonth)} Attendance` : 'No Records'}
                </p>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[4px]" style={{ background: STATUS_COLORS.present.bg, border: `1px solid ${STATUS_COLORS.present.text}` }} />
                    <span className="text-[10px] text-muted">Present ({monthPresentCount})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[4px]" style={{ background: STATUS_COLORS.absent.bg, border: `1px solid ${STATUS_COLORS.absent.text}` }} />
                    <span className="text-[10px] text-muted">Absent ({totalAbsent})</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {DAYS_OF_WEEK.map((d, i) => (
                  <div key={i} className="text-[10px] font-bold text-muted text-center tracking-[0.05em] uppercase pb-1">{d}</div>
                ))}
                {gridDays.map((item, idx) => {
                  if (item.date === null) return <div key={`e-${idx}`} className="aspect-square" />
                  if (item.date?.startsWith('__future__')) {
                    const ds = item.date.replace('__future__', '')
                    const dayNum = parseInt(ds.split('-')[2])
                    return (
                      <div
                        key={item.date}
                        className="aspect-square rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold select-none bg-surface-2/30 text-muted"
                        title={`${dayNum} - Future (not counted)`}
                      >
                        <span className="text-[12px] leading-none">{dayNum}</span>
                      </div>
                    )
                  }
                  const rec = monthRecords.find(r => r.date === item.date)
                  const status = rec?.status ?? null

                  // Determine cell style
                  let sc = STATUS_COLORS.present
                  let initial = 'P'

                  if (!item.date) {
                    return <div key={`e-${idx}`} className="aspect-square" />
                  }

                  if (status === null) {
                    // Check if weekend or holiday
                    if (item.isWeekend) {
                      sc = { bg: 'var(--surface-2)', text: 'var(--text-muted)' }
                      initial = 'W'
                    } else if (item.isHoliday) {
                      sc = { bg: 'var(--surface-2)', text: 'var(--text-muted)' }
                      initial = 'H'
                    } else {
                      // No record within business days = present (inverse logic)
                      sc = STATUS_COLORS.present
                      initial = 'P'
                    }
                  } else {
                    // Have a record - get color from status
                    sc = STATUS_COLORS[status] ?? STATUS_COLORS.absent
                    initial = getStatusInitial(status)
                  }

                  const dayNum = parseInt(item.date.split('-')[2])
                  return (
                    <div
                      key={item.date}
                      className="aspect-square rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold select-none cursor-pointer hover:ring-2 hover:ring-accent/30 transition-all"
                      style={{ background: sc.bg, color: sc.text, opacity: (item.isWeekend || item.isHoliday) && status === null ? 0.5 : 1 }}
                      title={`${dayNum} - ${status || 'present'} - ${rec?.courseName ?? ''}`}
                      onClick={() => {
                        setViewMode('lesson-detail')
                      }}
                    >
                      <span className="text-[12px] leading-none">{dayNum}</span>
                      <span className="text-[8px] leading-none mt-[1px]">{initial}</span>
                    </div>
                  )
                })}
              </div>

              {/* Status legend */}
              <div className="flex gap-4 mt-4 pt-3 border-t border-bd">
                {Object.entries(STATUS_COLORS).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-[4px]" style={{ background: val.bg, border: `1px solid ${val.text}` }} />
                    <span className="text-[10px] text-muted font-medium uppercase">{key}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {viewMode === 'lesson-detail' && selectedLessonId && (() => {
        if (selectedLessonId === null) return null

        return (
          <div>
            <button onClick={() => { setViewMode('overview'); setSelectedLessonId(null) }} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary mb-4 transition-colors">
              <HiOutlineArrowLeft className="text-[14px]" />
              {t(tk('progress.backToOverview'))}
            </button>

            {selectedLesson && (
              <div className="mb-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-[8px] flex items-center justify-center text-[16px] font-bold text-white shrink-0" style={{ background: selectedLesson.color }}>
                  {selectedLesson.courseName.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-primary">{selectedLesson.courseName}</h2>
                  <p className="text-[12px] text-muted">{t(tk('progress.teacher'))}: {selectedLesson.teacherName}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <div className="card px-5 py-4">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Attendance Rate</p>
                <p className="text-2xl font-bold text-accent">{Math.round(effectiveAttendanceRate)}%</p>
              </div>
              <div className="card px-5 py-4">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Days Present</p>
                <p className="text-2xl font-bold" style={{ color: STATUS_COLORS.present.text }}>{currentStudentStats?.presentCount ?? 0}</p>
              </div>
              <div className="card px-5 py-4">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Total Sessions</p>
                <p className="text-2xl font-bold" style={{ color: STATUS_COLORS.absent.text }}>{(currentStudentStats?.presentCount ?? 0) + (currentStudentStats?.absentCount ?? 0)}</p>
              </div>
            </div>

            <div className="card px-5 py-5">
              <p className="text-[12px] font-bold text-primary mb-3">{monthName(selectedMonth)} Calendar</p>
              <div className="grid grid-cols-7 gap-1.5">
                {DAYS_OF_WEEK.map((d, i) => (
                  <div key={i} className="text-[10px] font-bold text-muted text-center tracking-[0.05em] uppercase pb-1">{d}</div>
                ))}
                {(() => {
                  const [year, month] = selectedMonth.split('-').map(Number)
                  const firstDayIdx = jsDayToGridIdx(new Date(year, month - 1, 1).getDay())
                  const daysInMonth = new Date(year, month, 0).getDate()
                  const gd: Array<{ date: string | null; isWeekend: boolean; isHoliday: boolean }> = []

                  for (let i = 0; i < firstDayIdx; i++) gd.push({ date: null, isWeekend: false, isHoliday: false })

                  for (let d = 1; d <= daysInMonth; d++) {
                    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const dateObj = new Date(year, month - 1, d)
                    const dayOfWeek = dateObj.getDay()
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                    const isHoliday = holidaySet.has(ds)
                    gd.push({ date: ds, isWeekend, isHoliday })
                  }

                  return gd.map((item, idx) => {
                    if (item.date === null) return <div key={`e-${idx}`} className="aspect-square" />
                    if (item.date > todayStr) return <div key={item.date} className="aspect-square rounded-[8px] bg-surface-2/30" />

                    const rec = lessonRecords.find(r => r.date === item.date)
                    const status = rec?.status ?? null

                    if (!status && (item.isWeekend || item.isHoliday)) {
                      return (
                        <div key={item.date} className="aspect-square rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold select-none" style={{ opacity: 0.5, background: 'var(--surface-2)', color: 'var(--text-muted)' }} title={`${item.date} - ${item.isWeekend ? 'Weekend' : 'Holiday'}`}>
                          <span className="text-[12px] leading-none">{parseInt(item.date.split('-')[2])}</span>
                          <span className="text-[8px] leading-none mt-[1px]">{item.isWeekend ? 'W' : 'H'}</span>
                        </div>
                      )
                    }

                    const c2 = rec ? (STATUS_COLORS[rec.status] ?? STATUS_COLORS.absent) : STATUS_COLORS.present
                    const initial = rec ? getStatusInitial(rec.status) : 'P'
                    const day = parseInt(item.date.split('-')[2])
                    return (
                      <div key={item.date} className="aspect-square rounded-[8px] flex flex-col items-center justify-center text-[11px] font-semibold select-none" style={{ background: c2.bg, color: c2.text }} title={`${day} - ${rec?.status ?? 'present'}`}>
                        <span className="text-[12px] leading-none">{day}</span>
                        <span className="text-[8px] leading-none mt-[1px]">{initial}</span>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
