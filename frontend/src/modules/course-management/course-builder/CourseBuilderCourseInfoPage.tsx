import { useNavigate, useParams } from 'react-router-dom'
import { HiOutlineArrowLeft } from 'react-icons/hi2'
import CourseInfoEditorPage from '../course-info/editor/CourseInfoEditorPage'

// Bridge between Course Builder detail and the Course Information editor.
// Course Information now hangs directly off the course master, so the editor is
// keyed on the master id — no separate CourseInfo row to resolve or create.
export default function CourseBuilderCourseInfoPage() {
  const { id } = useParams<{ id: string }>()
  const masterId = Number(id)
  const navigate = useNavigate()
  const detailPath = `/course-management/course-builder/${masterId}`

  if (!Number.isFinite(masterId)) {
    return (
      <div className="px-6 py-4">
        <button
          onClick={() => navigate(detailPath)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          Back to Course Builder
        </button>
        <div className="text-sm text-red-500">Invalid course master id</div>
      </div>
    )
  }

  return <CourseInfoEditorPage courseInfoId={masterId} returnPath={detailPath} />
}
