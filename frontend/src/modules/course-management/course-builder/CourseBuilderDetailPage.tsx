import {useCallback} from 'react'
import {useParams} from 'react-router-dom'
import {useShallow} from 'zustand/react/shallow'
import CourseDetailPage from '../_shared/CourseDetailPage'
import useCourseBuilderStore from './store'

const BASE_PATH = '/course-management/course-builder'

export default function CourseBuilderDetailPage() {
  const {id} = useParams<{id: string}>()
  const masterId = Number(id)

  const {current, loading, error, fetchOne} = useCourseBuilderStore(
    useShallow((s) => ({
      current: s.current,
      loading: s.loading,
      error: s.error,
      fetchOne: s.fetchOne,
    })),
  )

  const onMount = useCallback(() => {
    if (Number.isFinite(masterId)) fetchOne(masterId)
  }, [fetchOne, masterId])

  return (
    <CourseDetailPage
      record={current}
      loading={loading}
      error={error}
      onMount={onMount}
      listPath={BASE_PATH}
      scopeLabel="Course Builder"
      detailPath={`${BASE_PATH}/${masterId}`}
      headerExtras={
        current && (
          <span
            className="inline-flex items-center mt-3 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
            style={
              current.status === 'approved'
                ? {background: 'rgba(34,197,94,0.10)', color: '#16A34A'}
                : {background: 'rgba(245,158,11,0.12)', color: '#D97706'}
            }
          >
            {current.status}
          </span>
        )
      }
    />
  )
}
