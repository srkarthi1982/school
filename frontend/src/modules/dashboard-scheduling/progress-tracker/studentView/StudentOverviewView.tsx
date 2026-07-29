import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineAcademicCap,
  HiOutlineClipboardDocumentCheck,
  HiOutlineSpeakerWave,
  HiMiniBookOpen,
} from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import SectionHeader from '../../../../infra/shared/components/SectionHeader'
import StatCard from '../components/StatCard'
import useProgressStore, { computeCourseStats } from '../store'
import type { StudentViewMode } from '../store'
import { getColorById } from '../utils'
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

// ============================================================
// Overview View
// ============================================================
export default function StudentOverviewView({ onDrillInto, fromExternalView = false }: {
  onDrillInto: (view: StudentViewMode) => void,
  fromExternalView?: boolean
}) {
  const { t } = useI18n()
  const location = useLocation();
  const { viewMode } = (location.state as any) || {};

  useEffect(() => {
    if (fromExternalView) {
      //void useProgressStore.getState().fetchAll()
      void useProgressStore.getState().fetchStudentOverview()
    }
  }, [fromExternalView])

  useEffect(() => {
    if (viewMode) {
      onDrillInto(viewMode);
    }
  }, [viewMode, onDrillInto]);
  const courses = useProgressStore(useShallow((s) => s.courses))
  const stats = computeCourseStats(courses)

  return (
    <div >
      {/* Header */}
      {!fromExternalView && <SectionHeader title={t('nav.progressTracker')} />}
      {/* Summary Stat Cards */}
      <div className="flex gap-3 mb-6 flex-wrap mt-3">
        <StatCard
          icon={<HiOutlineAcademicCap />}
          label={t('nav.overallProgress')}
          value={`${stats.overall}%`}
          color={getColorById(1)}
          percentage={stats.overall}
          subLabel="completed lessons avg"
          onClick={() => onDrillInto('lessons')}
        />
        <StatCard
          icon={<HiOutlineClipboardDocumentCheck />}
          label={t('nav.overallAttendance')}
          value={`${stats.attendance}%`}
          color={getColorById(2)}
          percentage={stats.attendance}
          subLabel="attendance rate"
          onClick={() => onDrillInto('attendance')}
        />
        <StatCard
          icon={<HiOutlineSpeakerWave />}
          label={t('nav.overallAssessment')}
          value={`${stats.quizzes}%`}
          color={getColorById(3)}
          percentage={stats.quizzes}
          subLabel="assessment avg"
          onClick={() => onDrillInto('assessment')}
        />
        <StatCard
          icon={<HiMiniBookOpen />}
          label={t('nav.overallMaterials')}
          value={`${stats.materials}%`}
          color={getColorById(7)}
          percentage={stats.materials}
          subLabel="completion rate"
          onClick={() => onDrillInto('materials')}
        />
      </div>
    </div>
  )
}
