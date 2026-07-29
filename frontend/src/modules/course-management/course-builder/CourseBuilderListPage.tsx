import {useCallback, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useShallow} from 'zustand/react/shallow'
import CourseListPage from '../_shared/CourseListPage'
import NewCourseModal from '../_shared/NewCourseModal'
import type {CourseMasterRecord} from '../_shared/types'
import CloneCourseModal from './CloneCourseModal'
import useCourseBuilderStore from './store'

const BASE_PATH = '/course-management/course-builder'

export default function CourseBuilderListPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [showClone, setShowClone] = useState(false)
  // Record whose basic-settings edit modal is open (null → closed).
  const [settingsRecord, setSettingsRecord] = useState<CourseMasterRecord | null>(null)

  const {records, loading, error, fetchAll, create, clone, update, setApproval, remove, clearError} =
    useCourseBuilderStore(
      useShallow((s) => ({
        records: s.records,
        loading: s.loading,
        error: s.error,
        fetchAll: s.fetchAll,
        create: s.create,
        clone: s.clone,
        update: s.update,
        setApproval: s.setApproval,
        remove: s.remove,
        clearError: s.clearError,
      })),
    )

  const onMount = useCallback(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <>
      <CourseListPage
        chipLabel="Course Builder"
        title="Course Builder"
        subtitle="Create and manage Course Master and their associated forms."
        addLabel="Add"
        records={records}
        loading={loading}
        error={error}
        onDismissError={clearError}
        onMount={onMount}
        onDelete={remove}
        onClickAdd={() => setShowCreate(true)}
        addDataGuide="course-builder:create"
        onClickClone={() => setShowClone(true)}
        onClickEdit={(r) => navigate(`${BASE_PATH}/${r.id}`)}
        onClickSettings={(r) => setSettingsRecord(r as CourseMasterRecord)}
        onToggleApprove={(r, approve) => setApproval(r as CourseMasterRecord, approve)}
        detailBasePath={BASE_PATH}
        showCtpVersion
        showLinkedCount
        modalSlot={
          <>
            {showCreate && (
              <NewCourseModal
                heading="New Course Master"
                onClose={() => setShowCreate(false)}
                onSubmit={async (values) => {
                  const created = await create(values)
                  if (created) {
                    navigate(`${BASE_PATH}/${created.id}`)
                  }
                }}
              />
            )}
            {showClone && (
              <CloneCourseModal
                masters={records}
                onClose={() => setShowClone(false)}
                onSubmit={async (values) => {
                  const created = await clone(values)
                  if (created) {
                    navigate(`${BASE_PATH}/${created.id}`)
                  }
                }}
              />
            )}
            {settingsRecord && (() => {
              // Approved masters are locked: the Settings modal becomes a
              // read-only viewer instead of an editor.
              const approved = settingsRecord.status.toLowerCase() === 'approved'
              return (
                <NewCourseModal
                  heading={approved ? 'Course Master' : 'Edit Course Master'}
                  submitLabel="Save"
                  readOnly={approved}
                  initialValues={{
                    title: settingsRecord.title,
                    ctp_version: settingsRecord.ctp_version ?? '',
                    course_date: settingsRecord.course_date,
                  }}
                  onClose={() => setSettingsRecord(null)}
                  onSubmit={async (values) => {
                    await update(settingsRecord.id, values)
                  }}
                />
              )
            })()}
          </>
        }
      />
    </>
  )
}
