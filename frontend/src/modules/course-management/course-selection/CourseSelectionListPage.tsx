import {useCallback, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useShallow} from 'zustand/react/shallow'
import CourseListPage from '../_shared/CourseListPage'
import {INSTANCE_CATEGORIES} from '../_shared/types'
import type {CourseRecord} from '../_shared/types'
import CourseInstanceModal from './CourseInstanceModal'
import ExtendPeriodModal from './ExtendPeriodModal'
import useCourseSelectionStore from './store'
import {confirmDialog} from '../../../infra/shared/store/useConfirmStore'

// Days between the stop date and today — the gap pending sessions (and the end
// date) will shift by on resume. Mirrors the backend's computation.
function stopGapDays(stoppedAt: string | null): number {
  if (!stoppedAt) return 0
  const stopped = new Date(`${stoppedAt}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today.getTime() - stopped.getTime()) / 86_400_000))
}

const BASE_PATH = '/course-management/course-selection'

export default function CourseSelectionListPage() {
  const navigate = useNavigate()
  // null → closed; 'new' → create; record → edit.
  const [modal, setModal] = useState<'new' | CourseRecord | null>(null)
  // Approved record whose period is being extended (null → modal closed).
  const [extendTarget, setExtendTarget] = useState<CourseRecord | null>(null)

  const {records, masters, loading, error, fetchAll, fetchMasters, create, update, setApproval, extendPeriod, stopCourse, resumeCourse, remove, clearError} =
    useCourseSelectionStore(
      useShallow((s) => ({
        records: s.records,
        masters: s.masters,
        loading: s.loading,
        error: s.error,
        fetchAll: s.fetchAll,
        fetchMasters: s.fetchMasters,
        create: s.create,
        update: s.update,
        setApproval: s.setApproval,
        extendPeriod: s.extendPeriod,
        stopCourse: s.stopCourse,
        resumeCourse: s.resumeCourse,
        remove: s.remove,
        clearError: s.clearError,
      })),
    )

  const onClickStop = useCallback(async (record: CourseRecord) => {
    const confirmed = await confirmDialog({
      title: 'Stop course',
      message:
        `Stop "${record.title}"? All activities for this course will be put ` +
        'on hold until it is resumed.',
      confirmLabel: 'Stop course',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!confirmed) return
    try {
      await stopCourse(record.id)
    } catch {
      // store.error already populated
    }
  }, [stopCourse])

  const onClickResume = useCallback(async (record: CourseRecord) => {
    const gap = stopGapDays(record.stopped_at)
    const message =
      gap > 0
        ? `The course was stopped for ${gap} day${gap === 1 ? '' : 's'}. ` +
          `Upcoming sessions and the end date will move forward by the same ` +
          'gap, skipping off-days and holidays.'
        : 'The course was stopped today, so no sessions need to move. It will simply become active again.'
    const confirmed = await confirmDialog({
      title: 'Resume course',
      message,
      confirmLabel: 'Resume course',
      cancelLabel: 'Cancel',
    })
    if (!confirmed) return
    try {
      await resumeCourse(record.id)
    } catch {
      // store.error already populated
    }
  }, [resumeCourse])

  const onMount = useCallback(() => {
    fetchAll()
    fetchMasters()
  }, [fetchAll, fetchMasters])

  return (
    <CourseListPage
      chipLabel="Course Selection"
      title="Course Selection"
      subtitle="Create and manage Course Iteration spawned from Course Builder masters."
      addLabel="Add"
      records={records}
      loading={loading}
      error={error}
      onDismissError={clearError}
      onMount={onMount}
      onDelete={remove}
      onClickAdd={() => setModal('new')}
      addDataGuide="course-selection:create"
      onClickEdit={(r) => navigate(`${BASE_PATH}/${r.id}`)}
      onClickSettings={(r) => setModal(r as CourseRecord)}
      onToggleApprove={(r, approve) => setApproval(r as CourseRecord, approve)}
      onClickExtend={(r) => setExtendTarget(r as CourseRecord)}
      onClickStop={(r) => onClickStop(r as CourseRecord)}
      onClickResume={(r) => onClickResume(r as CourseRecord)}
      detailBasePath={BASE_PATH}
      categories={INSTANCE_CATEGORIES}
      titleCellRender={(r) => `${r.title} - ${r.id}`}
      isModified={(r) => {
        const c = r as CourseRecord
        return !!(c.material_modified || c.surveys_modified || c.evaluation_modified)
      }}
      modalSlot={
        extendTarget !== null ? (
          <ExtendPeriodModal
            record={extendTarget}
            onClose={() => setExtendTarget(null)}
            onSubmit={(days) => extendPeriod(extendTarget.id, days)}
          />
        ) : modal !== null ? (
          <CourseInstanceModal
            record={modal === 'new' ? null : modal}
            masters={masters}
            // Approved (and stopped) instances are locked: the Settings modal
            // becomes a read-only viewer instead of an editor.
            readOnly={modal !== 'new' && ['approved', 'stopped'].includes(modal.status.toLowerCase())}
            onClose={() => setModal(null)}
            onSubmit={async (payload) => {
              if (modal === 'new') {
                const created = await create(payload)
                if (created) navigate(`${BASE_PATH}/${created.id}`)
              } else {
                await update(modal.id, {...payload})
              }
            }}
          />
        ) : null
      }
    />
  )
}
