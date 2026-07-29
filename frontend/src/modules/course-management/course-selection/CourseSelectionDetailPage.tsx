import {useCallback} from 'react'
import {useParams} from 'react-router-dom'
import {useShallow} from 'zustand/react/shallow'
import CourseDetailPage from '../_shared/CourseDetailPage'
import {INSTANCE_CATEGORIES} from '../_shared/types'
import type {CategorySlug, CourseRecord} from '../_shared/types'
import useCourseSelectionStore from './store'

const BASE_PATH = '/course-management/course-selection'

export default function CourseSelectionDetailPage() {
  const {id} = useParams<{id: string}>()
  const courseId = Number(id)

  const {current, loading, error, fetchOne} = useCourseSelectionStore(
    useShallow((s) => ({
      current: s.current,
      loading: s.loading,
      error: s.error,
      fetchOne: s.fetchOne,
    })),
  )

  const onMount = useCallback(() => {
    if (Number.isFinite(courseId)) fetchOne(courseId)
  }, [fetchOne, courseId])

  const instance = current as CourseRecord | null
  const modifiedFor = (slug: CategorySlug): boolean => {
    if (!instance) return false
    if (slug === 'course-information') return !!instance.course_info_modified
    if (slug === 'material') return !!instance.material_modified
    if (slug === 'surveys') return !!instance.surveys_modified
    if (slug === 'evaluation') return !!instance.evaluation_modified
    if (slug === 'currencies-certificate') return !!instance.currencies_cert_modified
    return false
  }

  return (
    <CourseDetailPage
      record={current}
      loading={loading}
      error={error}
      onMount={onMount}
      listPath={BASE_PATH}
      scopeLabel="Course Selection"
      detailPath={`${BASE_PATH}/${courseId}`}
      categories={INSTANCE_CATEGORIES}
      modifiedFor={modifiedFor}
      headerExtras={
        current?.start_date ? (
          <p className="text-[13px] text-secondary mt-0.5">
            Start Date: {current.start_date}
            {current.end_date ? ` — End Date: ${current.end_date}` : ''}
          </p>
        ) : null
      }
    />
  )
}
