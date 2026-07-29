import { useShallow } from 'zustand/react/shallow'
import {
    HiOutlineChartBar,
    HiOutlineAcademicCap,
    HiOutlineClipboardDocumentCheck,
    HiOutlineBookOpen,
    HiOutlineSpeakerWave,
    HiOutlinePresentationChartLine,
} from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../../infra/shared/components/EmptyState'
import StatCard from '../components/StatCard'
import BarChart from '../components/BarChart'
  import useProgressStore, { computeTeacherCourseStats } from '../store'
import type { TeacherCourseProgress } from '../store'
import type { ViewMode } from '../store'
import { getColorById } from '../utils'
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

// ============================================================
// Teacher Overview View
// ============================================================
export default function TeacherOverviewView({ onDrillInto, fromExternalView = false }: {
    onDrillInto: (view: ViewMode) => void,
    fromExternalView?: boolean
}) {
  const { t } = useI18n()
  const location = useLocation()
  const { viewMode } = (location.state as any) || {}

  useEffect(() => {
    if (fromExternalView) {
      void useProgressStore.getState().fetchTeacherOverview()
    }
  }, [fromExternalView])

  useEffect(() => {
    if (viewMode) {
      onDrillInto(viewMode)
    }
  }, [viewMode, onDrillInto])

  const courses = useProgressStore(useShallow((s) => s.teacherCourses))

   const stats = computeTeacherCourseStats(courses)
  const inUserProfile = 'pathname' in location && location.pathname === '/profile-general-info'

    return (
        <div>
            {/* Header */}
            {!fromExternalView && (
                <SectionHeader
                    icon={<HiOutlinePresentationChartLine />}
                    title={t('progress.teacherOverview')}
                />
            )}

            {/* Summary Stat Cards */}
            <div className="flex gap-3 mb-6 flex-wrap mt-3">
                <StatCard
                    icon={<HiOutlineAcademicCap />}
                    label={t('progress.teacherCoursesTeaching')}
                    value={`${stats.totalCourses}%`}
                    color={getColorById(1)}
                    subLabel="completed lessons avg"
                    onClick={() => onDrillInto('lessons')}
                />
                <StatCard
                    icon={<HiOutlineClipboardDocumentCheck />}
                    label={t('progress.overallAttendance')}
                    value={`${stats.overallAttendance}%`}
                    color={getColorById(2)}
                    percentage={stats.overallAttendance}
                    subLabel="attendance rate"
                    onClick={() => onDrillInto('attendance')}
                />
                <StatCard
                    icon={<HiOutlineSpeakerWave />}
                    label={t('progress.overallAssessment')}
                    value={`${stats.overallAssessmentAvg}%`}
                    color={getColorById(3)}
                    percentage={stats.overallAssessmentAvg}
                    subLabel="assessment avg"
                    onClick={() => onDrillInto('assessment')}
                />
                <StatCard
                    icon={<HiOutlineBookOpen />}
                    label={t('progress.overallMaterials')}
                    value={`${stats.overallMaterialsCompletion}%`}
                    color={getColorById(7)}
                    percentage={stats.overallMaterialsCompletion}
                    subLabel="completion rate"
                    onClick={() => onDrillInto('materials')}
                />
            </div>

            {/* Visualization section */}
            <div className={`card px-5 py-5 mb-6 ${inUserProfile ? 'hidden' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                    <HiOutlineChartBar className="text-[15px] text-accent" />
                    <p className="text-[12px] font-bold text-primary">{t('nav.barChart')}</p>
                </div>
                <p className="text-[11.5px] text-muted mb-4">{t('progress.teacherStudentProgress')}</p>
                {courses.length === 0 ? (
                    <EmptyState
                        fill={!fromExternalView}
                        bare
                        icon={<HiOutlinePresentationChartLine />}
                        title={t('common.noRecords')}
                        description={t('empty.progress.description')}
                        hints={[
                            {
                                icon: <HiOutlineClipboardDocumentCheck />,
                                title: t('empty.progress.attendanceTitle'),
                                description: t('empty.progress.attendanceDesc')
                            },
                            {
                                icon: <HiOutlineChartBar />,
                                title: t('empty.progress.compareTitle'),
                                description: t('empty.progress.compareDesc')
                            },
                        ]}
                    />
                ) : (
                    <BarChart courses={courses as TeacherCourseProgress[]} />
                )}
            </div>
        </div>
    )
}
