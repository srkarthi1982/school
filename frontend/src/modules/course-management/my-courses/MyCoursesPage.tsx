import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
    HiOutlineBackward,
    HiOutlineBellAlert,
    HiOutlineBookOpen,
    HiOutlineClipboardDocumentList,
    HiOutlineDocumentText,
    HiUserGroup,
} from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useCourseManagementDefaultStore, { CourseItem, CourseRegistered, StudentProfile } from '../store'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import StudentList from '../components/StudentList'
import { useLocation, useNavigate } from 'react-router-dom'

type SectionId = 'courses' | 'enrolled' | 'materials' | 'announcements'

// const COURSE_STATUS: Record<'active' | 'upcoming' | 'completed', { label: string; bg: string; text: string }> = {
//     active: {label: 'Active', bg: 'rgba(34,197,94,0.10)', text: '#16A34A'},
//     upcoming: {label: 'Upcoming', bg: 'rgba(59,130,246,0.10)', text: '#2563EB'},
//     completed: {label: 'Completed', bg: 'rgba(147,51,234,0.10)', text: '#7C3AED'},
// }

function CoursePage({ onViewEnrolledStudents }: { onViewEnrolledStudents: (course: CourseItem) => void }) {
    // const { t } = useI18n()
    // const [active, setActive] = useState<SectionId>('courses')

    const { courses, listMyCourses } = useCourseManagementDefaultStore(useShallow((s) => ({ courses: s.courses, listMyCourses: s.listMyCourses })))

    useEffect(() => {
        (async () => {
            await listMyCourses()
        })();
    }, [])
    return (
        <div className="flex h-full min-h-0 gap-0">
            <div className="flex-1 min-w-0 overflow-y-auto thin-scrollbar-light flex flex-col gap-4">
                <SectionHeader icon={<HiOutlineBookOpen />} title="My Courses" />
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
                    {courses.map((c) => {
                        return (
                            <div key={c.id} className="card px-5 py-4 flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-bold text-accent tracking-[0.08em] uppercase mb-1">
                                            {c.code}
                                        </p>
                                        <h3 className="text-[14px] font-bold text-primary leading-snug">{c.title}</h3>
                                    </div>
                                </div>

                                <p className="text-[12px] text-secondary leading-relaxed">{c.outline}</p>

                                <div className="flex items-center justify-between text-[12px] text-muted">
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 text-[11.5px] text-muted">
                                    </div>
                                    <button
                                        className="text-[12px] font-semibold text-accent hover:underline cursor-pointer bg-transparent border-none p-0"
                                        onClick={() => onViewEnrolledStudents(c)}
                                    >
                                        {c.students_count} students enrolled →
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default function MyCoursesPage() {
    const {
        listStudentsByCourse,
        enrolledStudents,
    } = useCourseManagementDefaultStore(useShallow(s => ({
        enrolledStudents: s.enrolledStudents,
        listStudentsByCourse: s.listStudentsByCourse
    })))
    const navigate = useNavigate()
    const { selectedCourse } = useLocation().state || { selectedCourse: undefined }

    // console.log('x', selectedCourse)
    const onViewEnrolledStudents = useCallback((course: CourseItem) => {
        navigate('/course-management/my-courses', { state: { selectedCourse: course } })
    }, [])

    const onStudentSelected = useCallback((student: StudentProfile) => {
        navigate('/profile-general-info', { state: { user: { username: student.username } } })
    }, [])

    useEffect(() => {
        if (!selectedCourse || !selectedCourse.id) return;

        (async () => {
            await listStudentsByCourse(selectedCourse.id)
        })()
    }, [selectedCourse])
    return (
        <>
            {!selectedCourse && <CoursePage onViewEnrolledStudents={onViewEnrolledStudents} />}
            {selectedCourse && (
                <div className="flex h-full min-h-0 gap-0">
                    <div className="flex-1 min-w-0 overflow-y-auto thin-scrollbar-light">
                        {/* <button onClick={() => setSelectedCourse(undefined)} */}
                        <button onClick={() => navigate(-1)}
                            className="inline-flex items-center mb-4 gap-1 px-2.5 py-1 rounded-[7px] font-semibold text-sm bg-accent text-white hover:opacity-90 transition-opacity border-none cursor-pointer font-sans">
                            <HiOutlineBackward /> Back
                        </button>
                        <SectionHeader icon={<HiUserGroup />} title={`${selectedCourse.title} Students`} />
                        <StudentList students={enrolledStudents} onStudentSelected={onStudentSelected} />
                    </div>
                </div>
            )}
        </>
    )
}
