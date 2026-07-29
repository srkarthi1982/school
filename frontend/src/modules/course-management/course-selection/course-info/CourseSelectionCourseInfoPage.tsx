import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import CourseInfoEditorPage from '../../course-info/editor/CourseInfoEditorPage'
import { CourseInfoApiProvider, type CourseInfoApi } from '../../course-info/editor/ApiContext'
import * as instanceApi from './api'

// Bridge between the Course Selection detail page and the shared Course
// Information editor. Same editor UI as Course Builder, but the api provider
// points it at the instance endpoints (/api/v1/course-selection-info), which
// lazily clone the master's Course Information into this instance's own tables.
export default function CourseSelectionCourseInfoPage() {
  const { id } = useParams<{ id: string }>()
  const instanceId = Number(id)
  const navigate = useNavigate()
  const detailPath = `/course-management/course-selection/${instanceId}`

  const api = useMemo<CourseInfoApi>(() => instanceApi, [])

  if (!Number.isFinite(instanceId)) {
    return (
      <div className="px-6 py-4">
        <button
          onClick={() => navigate(detailPath)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          Back to Course Selection
        </button>
        <div className="text-sm text-red-500">Invalid course id</div>
      </div>
    )
  }

  return (
    <CourseInfoApiProvider value={api}>
      <CourseInfoEditorPage
        courseInfoId={instanceId}
        returnPath={detailPath}
        editableTabNos={['lesson_creation']}
      />
    </CourseInfoApiProvider>
  )
}
