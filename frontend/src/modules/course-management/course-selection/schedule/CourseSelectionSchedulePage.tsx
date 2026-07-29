import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { HiOutlineCalendarDays } from 'react-icons/hi2'
import CourseSchedulePage from '../../_shared/CourseSchedulePage'
import { instanceScheduleApi, instanceLessonDetailApi } from './api'
import GenerateDatesModal from './GenerateDatesModal'

/**
 * Course Selection (instance) Schedule. Reuses the shared schedule screen but
 * drives the instance endpoints + the instance's own lessons, and adds the
 * "Generate dates" action that labels day rows with real calendar dates.
 */
export default function CourseSelectionSchedulePage() {
  const { id } = useParams<{ id: string }>()
  const detailPath = `/course-management/course-selection/${id}`
  const [genOpen, setGenOpen] = useState(false)

  const generateButton = (
    <button
      type="button"
      onClick={() => setGenOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] text-secondary text-[12px] font-semibold border border-[var(--border)] cursor-pointer hover:text-primary transition-colors"
      title="Assign real calendar dates to the day rows"
    >
      <HiOutlineCalendarDays className="text-[14px]" />
      Generate dates
    </button>
  )

  return (
    <>
      <CourseSchedulePage
        scheduleApi={instanceScheduleApi}
        lessonDetailApi={instanceLessonDetailApi}
        detailPath={detailPath}
        extraToolbar={generateButton}
      />
      {genOpen && <GenerateDatesModal onClose={() => setGenOpen(false)} />}
    </>
  )
}
