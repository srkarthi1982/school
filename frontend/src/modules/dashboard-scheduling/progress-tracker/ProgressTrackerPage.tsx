import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom';
import { HiOutlineClipboardDocumentCheck, HiOutlineSpeakerWave, HiOutlineBookOpen, HiOutlineAcademicCap } from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import StudentOverviewView from './studentView/StudentOverviewView'
import OverviewView from './otherView/OverviewView'
import PerspectiveToggle from './components/PerspectiveToggle'
import useProgressStore from './store'
import StudentAttendanceDrillDown from './studentView/StudentAttendanceDrillDownPage'
import StudentAssessmentDrillDownPage from './studentView/StudentAssessmentDrillDownPage'
import StudentMaterialDrillDownPage from './studentView/StudentMaterialDrillDownPage'
import StudentLessonDrillDownPage from './studentView/StudentLessonDrillDownPage'
import TeacherLessonDrillDownPage from './otherView/LessonDrillDownPage'
import AttendanceDrillDown from './otherView/AttendanceDrillDownPage'
import AssessmentDrillDownPage from './otherView/AssessmentDrillDownPage'
import MaterialDrillDownPage from './otherView/MaterialDrillDownPage'
import type { StudentViewMode, ViewMode, ViewRole } from './store'

import useAuthStore from '../../../infra/auth/useAuthStore'
import { PermissionCode } from '../../../infra/shared/types/permissions.gen'
import { useShallow } from 'zustand/react/shallow'

export default function ProgressTrackerPage() {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<StudentViewMode | ViewMode>('overview')
  const [viewRole, setViewRole] = useState<ViewRole>('student')
  const [selectedPerspective, setPerspective] = useProgressStore(useShallow((s) => ([s.selectedPerspective, s.setPerspective])))
  const { permissions } = useAuthStore()

  useEffect(() => {
    if (!permissions || permissions.size == 0) return;

    let isStudent = false;
    let isTeacher = false;
    let isAdmin = false;

    // identify user role (student, teacher, admin) based on permissions
    permissions.forEach((x: PermissionCode) => {
      if (x === 'progress_tracker:student') isStudent = true;
      if (x === 'progress_tracker:teacher') isTeacher = true;
      if (x === 'progress_tracker:admin') isAdmin = true;
    })

    // set view role to switch between teacher and student view
    setViewRole(isAdmin ? 'admin' : (isTeacher && isStudent ? 'teacher_student' : (isTeacher ? 'teacher' : 'student')))

    // define default perspective based on user role
    if (isAdmin || isTeacher) {
      setPerspective('other')
    } else {
      setPerspective('student')
    }
  }, [permissions, setViewRole, setPerspective])

  useEffect(() => {
    void useProgressStore.getState().fetchAll()
  }, [])

  function handleDrillInto(view: StudentViewMode | ViewMode): void {
    setViewMode(view)
  }

  const location = useLocation();
  const navigate = useNavigate();

  function handleBack(): void {
    setViewMode('overview')
    useProgressStore.getState().setCourseId(null)
  }

  function handleBackFromDrill(): void {
    const origin = (location.state as any)?.origin;
    if (origin === 'profile') {
      navigate(-1);
    } else {
      handleBack();
    }
  }

  function renderDrillDown(): React.ReactNode | null {
    const perspectiveKey = selectedPerspective === 'other' ? 'other' : 'student'
    if (viewMode === 'attendance') {
      return selectedPerspective === 'other'
        ? <AttendanceDrillDown key={`${viewMode}-${perspectiveKey}`} title={t('progress.attendanceTracking')} description={t('progress.attendanceDescription')} icon={<HiOutlineClipboardDocumentCheck />} onBack={handleBackFromDrill} />
        : <StudentAttendanceDrillDown key={`${viewMode}-${perspectiveKey}`} title={t('progress.attendanceTracking')} description={t('progress.attendanceDescription')} icon={<HiOutlineClipboardDocumentCheck />} onBack={handleBackFromDrill} />
    }
    if (viewMode === 'assessment') {
      return selectedPerspective === 'other'
        ? <AssessmentDrillDownPage key={`${viewMode}-${perspectiveKey}`} title={t('progress.assessmentTracking')} description={t('progress.assessmentDescription')} icon={<HiOutlineSpeakerWave />} onBack={handleBackFromDrill} />
        : <StudentAssessmentDrillDownPage key={`${viewMode}-${perspectiveKey}`} title={t('progress.assessmentTracking')} description={t('progress.assessmentDescription')} icon={<HiOutlineSpeakerWave />} onBack={handleBackFromDrill} />
    }
    if (viewMode === 'materials') {
      return selectedPerspective === 'other'
        ? <MaterialDrillDownPage key={`${viewMode}-${perspectiveKey}`} title={t('nav.courseMaterials')} description={t('progress.materialsDescription')} icon={<HiOutlineBookOpen />} onBack={handleBackFromDrill} />
        : <StudentMaterialDrillDownPage key={`${viewMode}-${perspectiveKey}`} title={t('nav.courseMaterials')} description={t('progress.materialsDescription')} icon={<HiOutlineBookOpen />} onBack={handleBackFromDrill} />
    }
    if (viewMode === 'lessons') {
      return selectedPerspective === 'other'
        ? <TeacherLessonDrillDownPage key={`${viewMode}-${perspectiveKey}`} title={t('progress.lessonsTracking')} description={t('progress.teacherLessonsDescription')} icon={<HiOutlineAcademicCap />} onBack={handleBackFromDrill} />
        : <StudentLessonDrillDownPage key={`${viewMode}-${perspectiveKey}`} title={t('progress.lessonsTracking')} description={t('progress.lessonsDescription')} icon={<HiOutlineAcademicCap />} onBack={handleBackFromDrill} />
    }
    return null
  }

  const studentView = selectedPerspective === 'student'

  const drillDown = renderDrillDown()
  if (drillDown) {
    return (
      <div >
        {drillDown}
      </div>
    )
  }

  return (
    <div >
      {viewRole === 'teacher_student' &&
        <div className="flex items-center justify-between mb-4">
          <div className="w-32" />
          <PerspectiveToggle />
        </div>
      }
      {studentView ? (
        <StudentOverviewView onDrillInto={handleDrillInto} />
      ) : (
        <OverviewView onDrillInto={handleDrillInto} />
      )}
    </div>
  )
}
