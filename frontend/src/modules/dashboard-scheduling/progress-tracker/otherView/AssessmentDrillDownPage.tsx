import { useState, useMemo, useEffect, useCallback } from 'react'
import { HiOutlineArrowLeft, HiOutlineClipboardDocumentCheck, HiOutlineAcademicCap, HiOutlinePencil, HiOutlineCube } from 'react-icons/hi2'
import { useShallow } from 'zustand/react/shallow'
import useProgressStore from '../store'
import { useI18n, ValidTranslationKeys } from '../../../../infra/locales/I18nContext'
import { ASSESSMENT_STATUS_COLORS as STATUS_COLORS, scoreColor, getColorById } from '../utils'

const tk = (k: string) => k as any

const ASSESSMENT_TYPE_COLORS = {
  quiz:    { bg: 'rgba(99,102,241,0.12)', text: '#6366F1', icon: <HiOutlineAcademicCap className="text-[14px]" /> },
  survey:  { bg: 'rgba(236,72,153,0.12)', text: '#EC4899', icon: <HiOutlineClipboardDocumentCheck className="text-[14px]" /> },
  form:    { bg: 'rgba(245,158,11,0.12)', text: '#F59E0B', icon: <HiOutlinePencil className="text-[14px]" /> },
  flight:  { bg: 'rgba(14,165,233,0.12)', text: '#0EA5E7', icon: <HiOutlineCube className="text-[14px]" /> },
}

type Props = {
  title: string
  icon: React.ReactNode
  onBack: () => void
  description?: string
}

export default function AssessmentDrillDownPage({ title, icon, description, onBack }: Props) {
  const { t } = useI18n()
  const { studentQuizzes, courses, teacherCourses } = useProgressStore(
    useShallow((s) => ({
      studentQuizzes: s.studentQuizzes,
      courses: s.courses,
      teacherCourses: s.teacherCourses,
    }))
  )
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const drilldownLoading = useProgressStore(useShallow(s => s.drilldownLoading?.assessment ?? false))

  const handleSelectCourse = useCallback((courseId: number | null) => {
    setSelectedCourseId(courseId)
  }, [])

  useEffect(() => {
    useProgressStore.getState().fetchTeacherOverview()
    useProgressStore.getState().fetchTeacherDrilldown('assessment', { course_id: selectedCourseId, status: selectedStatus })
  }, [selectedCourseId, selectedStatus])

  const sKeys = ['completed', 'pending', 'missing'] as const
  const uniqueLessons = useMemo(() => teacherCourses, [teacherCourses])

  const completedCount = studentQuizzes.filter((q: any) => q.status === 'completed').length
  const missingCount = studentQuizzes.filter((q: any) => q.status === 'missing').length

  const overallStats = useMemo(() => {
    if (teacherCourses.length === 0) {
      return { overallQuizAvg: 0, overallSurveyScore: 0, overallFormScore: 0, overallFlightScore: 0 }
    }
    const n = teacherCourses.length
    return {
      overallQuizAvg: Math.round(teacherCourses.reduce((s, c) => s + c.averageQuizScore, 0) / n),
      overallSurveyScore: Math.round(teacherCourses.reduce((s, c) => s + c.averageSurveyScore, 0) / n),
      overallFormScore: Math.round(teacherCourses.reduce((s, c) => s + c.averageFormScore, 0) / n),
      overallFlightScore: Math.round(teacherCourses.reduce((s, c) => s + c.averageFlightScore, 0) / n),
      overallAssessmentAvg: Math.round(teacherCourses.reduce((s, c) => s + c.averageAssessmentScore, 0) / n),
    }
  }, [teacherCourses])

  const assessmentTotal = overallStats.overallAssessmentAvg

  return (
    <div>
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
        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[18px] bg-accent-light text-accent shrink-0">
          {icon}
        </div>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.02em]">{title}</h1>
      </div>
      <p className="text-[13px] text-muted ml-12 mb-6">{description}</p>

      {/* Assessment type summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: ASSESSMENT_TYPE_COLORS.quiz.text }} />
            <div className="flex items-center justify-center">
              {ASSESSMENT_TYPE_COLORS.quiz.icon}
            </div>
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">Quiz</p>
          </div>
          <p className="text-xl font-bold" style={{ color: ASSESSMENT_TYPE_COLORS.quiz.text }}>
            {overallStats.overallQuizAvg > 0 ? `${overallStats.overallQuizAvg}%` : '--'}
          </p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: ASSESSMENT_TYPE_COLORS.survey.text }} />
            <div className="flex items-center justify-center">
              {ASSESSMENT_TYPE_COLORS.survey.icon}
            </div>
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">Survey</p>
          </div>
          <p className="text-xl font-bold" style={{ color: ASSESSMENT_TYPE_COLORS.survey.text }}>
            {overallStats.overallSurveyScore > 0 ? `${overallStats.overallSurveyScore}%` : '--'}
          </p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: ASSESSMENT_TYPE_COLORS.form.text }} />
            <div className="flex items-center justify-center">
              {ASSESSMENT_TYPE_COLORS.form.icon}
            </div>
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">Form</p>
          </div>
          <p className="text-xl font-bold" style={{ color: ASSESSMENT_TYPE_COLORS.form.text }}>
            {overallStats.overallFormScore > 0 ? `${overallStats.overallFormScore}%` : '--'}
          </p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: ASSESSMENT_TYPE_COLORS.flight.text }} />
            <div className="flex items-center justify-center">
              {ASSESSMENT_TYPE_COLORS.flight.icon}
            </div>
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">Flight</p>
          </div>
          <p className="text-xl font-bold" style={{ color: ASSESSMENT_TYPE_COLORS.flight.text }}>
            {overallStats.overallFlightScore > 0 ? `${overallStats.overallFlightScore}%` : '--'}
          </p>
        </div>
      </div>

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
            {t(tk('progress.assessmentAll'))}
          </button>
          {uniqueLessons.map((c: any) => (
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

      {/* Status filter */}
      <div className="mb-4">
        <p className="text-[10px] text-muted uppercase tracking-wider font-medium mb-2">{t(tk('common.status'))}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedStatus(null)}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-full border border-bd transition-colors ${
              !selectedStatus
                ? 'bg-accent-light text-accent border-accent/30'
                : 'text-muted hover:border-accent/30'
            }`}
          >
            {t(tk('progress.assessmentAll'))}
          </button>
          {sKeys.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedStatus(s === selectedStatus ? null : s)}
              className={`flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-full border border-bd transition-colors ${
                selectedStatus === s
                  ? 'bg-accent-light text-accent border-accent/30'
                  : 'text-muted hover:border-accent/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s].text }} />
              {t(`progress.assessmentStatus${s.charAt(0).toUpperCase()}${s.slice(1)}` as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter reset */}
      {(selectedCourseId || selectedStatus) && (
        <button
          onClick={() => { setSelectedCourseId(null); setSelectedStatus(null) }}
          className="mb-4 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
        >
          {t(tk('progress.assessmentResetFilters'))}
        </button>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">Lessons</p>
          </div>
          <p className="text-xl font-bold text-accent">{uniqueLessons.length}</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS.completed.text }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.assessmentStatusCompleted'))}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: STATUS_COLORS.completed.text }}>{completedCount}</p>
        </div>
        <div className="card px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS.missing.text }} />
            <p className="text-[10px] text-muted uppercase tracking-wider font-medium">{t(tk('progress.assessmentStatusMissing'))}</p>
          </div>
          <p className="text-xl font-bold" style={{ color: STATUS_COLORS.missing.text }}>{missingCount}</p>
        </div>
      </div>

      {/* Quiz list with pagination */}
      {(studentQuizzes.length ?? 0) === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-muted text-[13px]">{t(tk('progress.teacherNoStudentAssessment'))}</p>
        </div>
      ) : (
        <>
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-start">
            <thead>
              <tr style={{ background: 'var(--navy)' }}>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.assessmentDate'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.course'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.assessmentTitle'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.teacherStudentName'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.assessmentType'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('progress.assessmentScore'))}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-white/60 uppercase tracking-[0.06em]">{t(tk('common.status'))}</th>
              </tr>
            </thead>
            <tbody>
              {studentQuizzes.map((q: any) => {
                const assessmentType = q.assessmentType as 'quiz' | 'survey' | 'form' | 'flight'
                return (
                <tr key={`${q.quizId}-${q.studentId}`} className="border-b border-bd hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 text-[12.5px] text-primary">
                    {q.date
                      ? new Date(q.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : ''}
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-primary font-medium">
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const lesson = courses.find((c: any) => c.courseId === q.courseId)
                        return lesson && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getColorById(q.courseId) }} />
                      })()}
                      {q.courseName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-primary font-medium">{q.title}</td>
                  <td className="px-4 py-3 text-[12px] text-primary">{q.studentName}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                      style={{
                        background: ASSESSMENT_TYPE_COLORS[assessmentType]?.bg || 'rgba(0,0,0,0.08)',
                        color: ASSESSMENT_TYPE_COLORS[assessmentType]?.text || 'var(--text-muted)',
                      }}
                    >
                      {t(`progress.assessmentType${assessmentType.charAt(0).toUpperCase()}${assessmentType.slice(1)}` as any)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono" style={{ color: scoreColor(q.total > 0 ? Math.round((q.score / q.total) * 100) : (q.score ?? 0)) }}>
                    {q.score != null ? (q.total > 0 ? `${q.score}/${q.total}` : `${q.score}`) : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-start px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ background: STATUS_COLORS[q.status].bg, color: STATUS_COLORS[q.status].text }}
                    >
                      {t(`progress.assessmentStatus${q.status.charAt(0).toUpperCase()}${q.status.slice(1)}` as any)}
                    </span>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {(() => {
          if (studentQuizzes.length <= 50) return null
          return (
            <div className="flex items-center justify-between mt-4">
              <p className="text-[12px] text-muted">Showing {studentQuizzes.length} results</p>
            </div>
          )
        })()}
        </>
      )}
        </>
      )}
    </div>
  )
}
