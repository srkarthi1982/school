import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { HiOutlineArrowLeft, HiOutlineVideoCamera, HiOutlineDocument, HiOutlineBookOpen, HiOutlineAcademicCap } from 'react-icons/hi2'
import { useShallow } from 'zustand/react/shallow'
import { useI18n, ValidTranslationKeys } from '../../../../infra/locales/I18nContext'
import useProgressStore from '../store'
import type { TeacherCourseProgress, StudentMaterialRecord } from '../store'
import { MATERIAL_STATUS_COLORS as STATUS_COLORS, formatDuration, isActive, getColorById } from '../utils'

type Material = StudentMaterialRecord

type FilterType = 'all' | Material['type']
type FilterCompletion = 'all' | 'completed' | 'in-progress' | 'not-started'

function getTypeIcon(type: Material['type']): React.ReactNode {
  switch (type) {
    case 'video': return <HiOutlineVideoCamera className="w-5 h-5" />
    case 'document': return <HiOutlineDocument className="w-5 h-5" />
    case 'reading': return <HiOutlineBookOpen className="w-5 h-5" />
    case 'assignment': return <HiOutlineAcademicCap className="w-5 h-5" />
  }
}

function getMaterialStatus(m: Material): 'completed' | 'in-progress' | 'not-started' {
  if (m.completed) return 'completed'
  if (m.watchedDuration && m.watchedDuration > 0) return 'in-progress'
  return 'not-started'
}

function getMaterialProgress(m: Material): number {
  if (m.completed) return 100
  if (m.totalDuration && m.watchedDuration) {
    return Math.round((m.watchedDuration / m.totalDuration) * 100)
  }
  return 0
}

function getStudentNameForMaterial(m: Material): string {
  return m.studentName || `Student ${m.studentId}`
}

interface FilterState {
  type: FilterType
  completion: FilterCompletion
  lesson: number | null
  student: number | null
}

const tk = (k: string) => k as any

export default function MaterialDrillDownPage({ title, description, icon, onBack }: { title: string; description: string; icon: React.ReactNode; onBack: () => void }) {
  const { t } = useI18n()
  const studentMaterials = useProgressStore(useShallow(s => s.studentMaterials))
  const materialCourses = useProgressStore(useShallow(s => s.teacherCourses))
  const [filter, setFilter] = useState<FilterState>({ type: 'all', completion: 'all', lesson: null, student: null })
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [completionFilter, setCompletionFilter] = useState<FilterCompletion>('all')
  const [materialTypeFilter, setMaterialTypeFilter] = useState<FilterType>('all')

  const drilldownLoading = useProgressStore(useShallow(s => s.drilldownLoading?.materials ?? false))

  const handleSelectCourse = useCallback((courseId: number | null) => {
    setSelectedCourseId(courseId)
  }, [])

  const handleSelectCompletion = useCallback((comp: FilterCompletion) => {
    setCompletionFilter(comp)
  }, [])

  useEffect(() => {
    const completed = completionFilter === 'completed' ? true : completionFilter === 'all' ? null : false
    const completion_state = completionFilter === 'in-progress' ? 'in-progress' : completionFilter === 'not-started' ? 'not-started' : null
    useProgressStore.getState().fetchTeacherDrilldown('materials', { course_id: selectedCourseId, completed, completion_state })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId, completionFilter])

  const uniqueLessonIds = useMemo(() => [...new Set(studentMaterials.map(m => m.courseId))], [studentMaterials])
  const uniqueStudentIds = useMemo(() => [...new Set(studentMaterials.map(m => m.studentId))], [studentMaterials])

  function getStudentName(id: number): string {
    return studentMaterials.find(m => m.studentId === id)?.studentName ?? `Student ${id}`
  }

  const filteredMaterials = useMemo(() => {
    return studentMaterials.filter(m => {
      if (filter.type !== 'all' && m.type !== filter.type) return false
      if (filter.completion === 'completed' && !m.completed) return false
      if (filter.completion === 'in-progress' && (!m.completed && (!m.watchedDuration || m.watchedDuration <= 0))) return false
      if (filter.completion === 'not-started' && (!m.completed && (!m.watchedDuration || m.watchedDuration <= 0))) return true
      if (filter.completion === 'not-started' && m.completed) return false
      if (filter.completion === 'not-started' && m.watchedDuration && m.watchedDuration > 0) return false
      if (filter.lesson !== null && m.courseId !== filter.lesson) return false
      if (filter.student !== null && m.studentId !== filter.student) return false
      return true
    })
  }, [studentMaterials, filter])

  const statCounts = useMemo(() => {
    return {
      total: filteredMaterials.length ?? 0,
      completed: filteredMaterials.filter((m: Material) => m.completed).length ?? 0,
      inProgress: filteredMaterials.filter((m: Material) => !m.completed && m.watchedDuration && m.watchedDuration > 0).length ?? 0,
      notStarted: filteredMaterials.filter((m: Material) => !m.completed && (!m.watchedDuration || m.watchedDuration <= 0)).length ?? 0,
    }
  }, [filteredMaterials])

  const selectedStudent = useMemo(() => {
    if (selectedStudentId === null) return null
    return { id: selectedStudentId, name: getStudentName(selectedStudentId) }
  }, [selectedStudentId, studentMaterials])

  const studentMaterialsForSelected = useMemo(() => {
    if (selectedStudentId === null) return []
    return studentMaterials.filter((m: Material) => m.studentId === selectedStudentId)
  }, [selectedStudentId, studentMaterials])

  // ---- Student Detail View ----
  if (selectedStudentId !== null && selectedStudent) {
    if (drilldownLoading) {
      return (
        <div className="ps-8 pt-1 pb-10">
          <div className="flex items-center justify-center py-16">
            <p className="text-muted text-[13px]">Loading...</p>
          </div>
        </div>
      )
    }
    const completedCount = studentMaterialsForSelected.filter((m: Material) => m.completed).length
    const inProgressCount = studentMaterialsForSelected.filter((m: Material) => !m.completed && m.watchedDuration && m.watchedDuration > 0).length

    return (
      <div className="ps-8 pt-1 pb-10">
        <button onClick={() => { setSelectedStudentId(null); setSelectedLessonId(null) }} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary mb-4 transition-colors">
          <HiOutlineArrowLeft className="text-[14px]" />
          {t(tk('progress.backToOverview'))}
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-[8px] flex items-center justify-center text-[16px] font-bold text-white shrink-0" style={{ background: 'var(--accent)' }}>
            {selectedStudent.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">{selectedStudent.name}</h2>
            <p className="text-[12px] text-muted">Lesson: {selectedLessonId !== null ? (materialCourses.find(c => c.courseId === selectedLessonId)?.courseName || '--') : t(tk('progress.materialAll'))}</p>
          </div>
        </div>

        {(() => {
          const mats = selectedLessonId !== null
            ? studentMaterialsForSelected.filter((m: Material) => m.courseId === selectedLessonId)
            : studentMaterialsForSelected
          const totalMats = mats.length

          return (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="card px-5 py-4">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(tk('progress.totalMaterials'))}</p>
                  <p className="text-2xl font-bold text-accent">{totalMats}</p>
                </div>
                <div className="card px-5 py-4">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(tk('progress.completed'))}</p>
                  <p className="text-2xl font-bold" style={{ color: STATUS_COLORS.completed.text }}>{completedCount}</p>
                </div>
                <div className="card px-5 py-4">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(tk('progress.inProgress'))}</p>
                  <p className="text-2xl font-bold" style={{ color: STATUS_COLORS['in-progress'].text }}>{inProgressCount}</p>
                </div>
                <div className="card px-5 py-4">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(tk('progress.notStarted'))}</p>
                  <p className="text-2xl font-bold" style={{ color: STATUS_COLORS['not-started'].text }}>{totalMats - completedCount - inProgressCount}</p>
                </div>
              </div>
              <div className="card p-0 overflow-hidden">
                <div className="px-5 py-4 border-b border-bd">
                  <p className="text-[12px] font-bold text-primary">{t(tk('progress.materialsList'))}</p>
                </div>
                <div className="divide-y divide-bd">
                  {mats.map((m: Material) => {
                    const prog = getMaterialProgress(m)
                    const st = getMaterialStatus(m)
                    return (
                      <div key={m.materialId} className="px-5 py-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[8px] flex items-center justify-center text-[18px] shrink-0" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                          {getTypeIcon(m.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-medium text-primary truncate">{m.title}</p>
                          <p className="text-[11px] text-muted capitalize">
                            {m.type}
                            {(m.totalDuration ?? 0) > 0 && <span> &middot; {formatDuration(m.watchedDuration ?? 0)} / {formatDuration(m.totalDuration ?? 0)}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-[5px] bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${prog}%`, background: STATUS_COLORS[st].text }} />
                          </div>
                          <span className="text-[11px] font-medium min-w-[80px] text-right" style={{ color: STATUS_COLORS[st].text }}>
                            {st === 'completed' ? t(tk('progress.completed')) : st === 'in-progress' ? t(tk('progress.inProgress')) : t(tk('progress.notStarted'))}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )
        })()}
      </div>
    )
  }

  // ---- Overview View ----
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
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] bg-accent-light text-accent shrink-0">{icon}</div>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.02em]">{title}</h1>
      </div>
      <p className="text-[13px] text-muted ml-12 mb-6">{description}</p>

      {/* Course filter */}
      <div className="mb-3">
        <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('progress.course'))}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleSelectCourse(null)}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
              !selectedCourseId
                ? 'bg-accent-light text-accent border-accent/30'
                : 'text-muted hover:border-accent/30'
            }`}
          >
            {t(tk('progress.materialAll'))}
          </button>
          {materialCourses.map((c: TeacherCourseProgress) => (
            <button
              key={c.courseId}
              onClick={() => handleSelectCourse(c.courseId)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
                selectedCourseId === c.courseId
                  ? 'bg-accent-light text-accent border-accent/30'
                  : 'text-muted hover:border-accent/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getColorById(c.courseId) }} />
              {c.courseName}
            </button>
          ))}
        </div>
      </div>

      {/* Completion filter */}
      <div className="mb-3">
        <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.status'))}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleSelectCompletion('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors capitalize ${completionFilter === 'all' ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLORS.completed.text }} />
            {t(tk('progress.materialAll') as any)}
          </button>
          {[
            { key: 'completed' as FilterCompletion, label: tk('progress.completed'), color: STATUS_COLORS.completed.text },
            { key: 'in-progress' as FilterCompletion, label: tk('progress.inProgress'), color: STATUS_COLORS['in-progress'].text },
            { key: 'not-started' as FilterCompletion, label: tk('progress.notStarted'), color: STATUS_COLORS['not-started'].text },
          ].map(fComp => (
            <button
              key={fComp.key}
              onClick={() => handleSelectCompletion(fComp.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors capitalize ${completionFilter === fComp.key ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: fComp.color }} />
              {t(fComp.label as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter reset */}
      {(filter.lesson !== null || filter.student !== null || filter.type !== 'all' || filter.completion !== 'all') && (
        <button onClick={() => setFilter({ type: 'all', completion: 'all', lesson: null, student: null })} className="mb-4 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors">
          {t(tk('progress.materialResetFilters'))}
        </button>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.totalMaterials'))}</p>
          </div>
          <p className="text-xl font-bold text-accent">{statCounts.total}</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS.completed.text }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.completed'))}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: STATUS_COLORS.completed.text }}>{statCounts.completed}</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS['in-progress'].text }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.inProgress'))}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: STATUS_COLORS['in-progress'].text }}>{statCounts.inProgress}</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS['not-started'].text }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.notStarted'))}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: STATUS_COLORS['not-started'].text }}>{statCounts.notStarted}</p>
        </div>
      </div>

      {/* Materials list grouped by student */}
      {filteredMaterials.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-muted text-[13px]">{t(tk('progress.teacherNoStudentMaterials'))}</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-start">
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.course'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.teacherStudentName'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.totalMaterials'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.completed'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.inProgress'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.notStarted'))}</th>
              </tr>
            </thead>
            <tbody>
              {uniqueStudentIds.map(studentId => {
                const studentMats = filteredMaterials.filter(m => m.studentId === studentId)
                if (studentMats.length === 0) return null
                const completedCount = studentMats.filter(m => m.completed).length
                const inProgressCount = studentMats.filter(m => !m.completed && m.watchedDuration && m.watchedDuration > 0).length
                const notStartedCount = studentMats.filter(m => !m.completed && (!m.watchedDuration || m.watchedDuration <= 0)).length

                return (
                  <tr
                    key={studentId}
                    className="border-b border-bd hover:bg-surface-2 transition-colors cursor-pointer"
                    onClick={() => { setSelectedStudentId(studentId); setSelectedLessonId(null) }}
                  >
                    <td className="px-4 py-3 text-[12.5px] text-muted">Multiple</td>
                    <td className="px-4 py-3 text-[12.5px] text-primary font-medium">{getStudentName(studentId)}</td>
                    <td className="px-4 py-3 text-[12px] text-primary">{studentMats.length}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: STATUS_COLORS.completed.bg, color: STATUS_COLORS.completed.text }}>{completedCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: STATUS_COLORS['in-progress'].bg, color: STATUS_COLORS['in-progress'].text }}>{inProgressCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: STATUS_COLORS['not-started'].bg, color: STATUS_COLORS['not-started'].text }}>{notStartedCount}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </div>
  )
}
