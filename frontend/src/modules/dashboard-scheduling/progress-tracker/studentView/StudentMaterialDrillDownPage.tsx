import React, { useMemo, useState, useEffect } from 'react'
import { HiOutlineArrowLeft, HiOutlineVideoCamera, HiOutlineDocument, HiOutlineBookOpen, HiOutlineAcademicCap } from 'react-icons/hi2'
import { useShallow } from 'zustand/react/shallow'
import { useI18n, ValidTranslationKeys } from '../../../../infra/locales/I18nContext'
import useProgressStore from '../store'
import type { CourseMaterialRecord, CourseProgress } from '../store'
import { MATERIAL_STATUS_COLORS as STATUS_COLORS, formatDuration, getColorById } from '../utils'

const tk = (k: string) => k as any

type Material = CourseMaterialRecord

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

interface FilterState {
  type: FilterType
  completion: FilterCompletion
  lesson: string
}

export default function StudentMaterialDrillDownPage({ title, description, icon, onBack }: { title: string; description: string; icon: React.ReactNode; onBack: () => void }) {
  const { t } = useI18n()
  const materialsList = useProgressStore(useShallow(s => s.materials))
  const materialCourses = useProgressStore(useShallow(s => s.courses))
  const drilldownLoading = useProgressStore(useShallow(s => s.drilldownLoading?.materials))
  const [filter, setFilter] = useState<FilterState>({ type: 'all', completion: 'all', lesson:'all' })
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)

  const uniqueCourses = useMemo(() => {
    const ids = new Set(materialsList.map(m => m.courseId))
    return materialCourses.filter(c => ids.has(c.courseId))
  }, [materialCourses, materialsList])

  useEffect(() => {
    const hasFilter = filter.completion !== 'all' || filter.type !== 'all' || filter.lesson !== 'all'
    if (!hasFilter) {
      useProgressStore.getState().fetchStudentDrilldown('materials')
    } else {
      const selectedCourse = materialCourses.find(c => c.courseName === filter.lesson)
      const hasCompletionFilter = filter.completion !== 'all'
      const hasLessonFilter = filter.lesson !== 'all'
      if (!hasCompletionFilter && !hasLessonFilter) {
        useProgressStore.getState().fetchStudentDrilldown('materials')
      } else {
        useProgressStore.getState().fetchStudentDrilldown('materials', {
          course_id: selectedCourse?.courseId,
          completed: filter.completion === 'completed' ? true : filter.completion === 'not-started' ? false : undefined,
          completion_state: filter.completion === 'in-progress' ? 'in-progress' : undefined,
        })
      }
    }
  }, [filter.completion, filter.lesson, materialCourses])

  const statCounts = useMemo(() => {
    return {
      total: materialsList.length ?? 0,
      completed: materialsList.filter((m: Material) => m.completed).length ?? 0,
      inProgress: materialsList.filter((m: Material) => !m.completed && m.watchedDuration && m.watchedDuration > 0).length ?? 0,
      notStarted: materialsList.filter((m: Material) => !m.completed && (!m.watchedDuration || m.watchedDuration <= 0)).length ?? 0,
    }
  }, [materialsList])

  const selectedLesson = useMemo(() => {
    if (selectedCourseId === null) return null
    return materialCourses.find(c => c.courseId === selectedCourseId) ?? null
  }, [selectedCourseId, materialCourses])

  const lessonMaterials = useMemo(() => {
    if (!selectedCourseId) return []
    return materialsList.filter((m: Material) => m.courseId === selectedCourseId)
  }, [selectedCourseId, materialsList])

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

  // ---- Lesson Detail View ----
  if (selectedCourseId !== null && selectedLesson) {
    const completedCount = lessonMaterials.filter((m: Material) => m.completed).length
    const inProgressCount = lessonMaterials.filter((m: Material) => !m.completed && m.watchedDuration && m.watchedDuration > 0).length
    const notStartedCount = lessonMaterials.filter((m: Material) => !m.completed && (!m.watchedDuration || m.watchedDuration <= 0)).length
    const totalMaterials = lessonMaterials.length

    return (
      <div className="ps-8 pt-1 pb-10">
        <button onClick={() => setSelectedCourseId(null)} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary mb-4 transition-colors">
          <HiOutlineArrowLeft className="text-[14px]" />
          {t(tk('progress.materialBackToOverview'))}
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-[8px] flex items-center justify-center text-[16px] font-bold text-white shrink-0" style={{ background: getColorById(selectedLesson.courseId) }}>
            {selectedLesson.courseName.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">{selectedLesson.courseName}</h2>
            <p className="text-[12px] text-muted">{t(tk('progress.teacher'))}: {selectedLesson.teacherName}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card px-5 py-4">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{t(tk('progress.totalMaterials'))}</p>
            <p className="text-2xl font-bold text-accent">{selectedLesson.materialsTotal}</p>
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
            <p className="text-2xl font-bold" style={{ color: STATUS_COLORS['not-started'].text }}>{notStartedCount}</p>
          </div>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-bd">
            <p className="text-[12px] font-bold text-primary">{t(tk('progress.materialsList'))}</p>
          </div>
          <div className="divide-y divide-bd">
            {lessonMaterials.map((m: Material) => {
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
      </div>
    )
  }

  // ---- Overview View ----
  return (
    <div className="ps-8 pt-1 pb-10">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-primary transition-colors">
          <HiOutlineArrowLeft className="text-[14px]" />
          {t(tk('progress.backToOverview'))}
        </button>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] bg-accent-light text-accent shrink-0">{icon}</div>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.02em]">{title}</h1>
      </div>
      <p className="text-[13px] text-muted ml-12 mb-6">{description}</p>

      {/* Completion filter */}
      <div className="mb-4">
        <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.status'))}</p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all' as FilterCompletion, label: tk('progress.materialAll'), color: 'var(--accent)' },
            { key: 'completed' as FilterCompletion, label: tk('progress.completed'), color: STATUS_COLORS.completed.text },
            { key: 'in-progress' as FilterCompletion, label: tk('progress.inProgress'), color: STATUS_COLORS['in-progress'].text },
            { key: 'not-started' as FilterCompletion, label: tk('progress.notStarted'), color: STATUS_COLORS['not-started'].text },
          ].map(fComp => (
            <button
              key={fComp.key}
              onClick={() => setFilter(prev => ({ ...prev, completion: fComp.key }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors capitalize ${fComp.key === filter.completion ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: fComp.color }} />
              {t(fComp.label as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Lesson list */}
      <div className="mb-4">
        <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.course'))}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter(prev => ({ ...prev, lesson: 'all' }))}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${filter.lesson === 'all' ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
          >
            {t(tk('progress.materialAll'))}
          </button>
          {uniqueCourses.map((c: CourseProgress) => (
            <button
              key={c.courseId}
              onClick={() => setFilter(prev => ({ ...prev, lesson: c.courseName }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${c.courseName === filter.lesson ? 'bg-accent-light text-accent border-accent/30' : 'text-muted hover:border-accent/30'}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getColorById(c.courseId) }} />
              {c.courseName}
            </button>
          ))}
        </div>
      </div>

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

      {/* Materials list */}
      {materialsList.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-muted text-[13px]">{t(tk('progress.noMaterialsFound'))}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {materialsList.map((m: Material) => {
            const matCourse = materialCourses.find((c: CourseProgress) => c.courseId === m.courseId)
            if (!matCourse) return null
            const prog = getMaterialProgress(m)
            const st = getMaterialStatus(m)
            return (
              <button
                key={m.materialId}
                className="card px-5 py-4 flex items-start gap-3 hover:shadow-md transition-shadow cursor-default text-start"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getColorById(matCourse.courseId) }} />
                    <p className="text-[11px] text-muted">{matCourse.courseName}</p>
                  </div>
                  <p className="text-[13px] font-medium text-primary truncate">{m.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-[4px] bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${prog}%`, background: STATUS_COLORS[st].text }} />
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: STATUS_COLORS[st].text }}>{prog}%</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ background: STATUS_COLORS[st].bg, color: STATUS_COLORS[st].text }}>
                      {st === 'completed' ? t(tk('progress.completed')) : st === 'in-progress' ? t(tk('progress.inProgress')) : t(tk('progress.notStarted'))}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
