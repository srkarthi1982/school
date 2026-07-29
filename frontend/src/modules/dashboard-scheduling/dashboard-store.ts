import { create } from 'zustand'
import '../../api/client'
import {
  listCoursesApiV1CatalogCoursesGet as listCourses,
  listDepartmentsApiV1CatalogDepartmentsGet as listDepartments,
  listEnrollmentsApiV1EnrollmentsGet as listEnrollments,
  listStudentsApiV1StudentsGet as listStudents,
  listTeachersApiV1TeachersGet as listTeachers,
} from '../../api/generated'

interface DashboardStats {
  students: number | null
  teachers: number | null
  courses: number | null
  departments: number | null
  enrollments: number | null
}

interface DashboardState {
  stats: DashboardStats
  fetchStats: () => Promise<void>
}

const useDashboardStore = create<DashboardState>((set) => ({
  stats: { students: null, teachers: null, courses: null, departments: null, enrollments: null },

  fetchStats: async () => {
    const [students, teachers, courses, departments, enrollments] = await Promise.all([
      listStudents().then((r) => (Array.isArray(r.data) ? r.data : [])),
      listTeachers().then((r) => (Array.isArray(r.data) ? r.data : [])),
      listCourses().then((r) => (Array.isArray(r.data) ? r.data : [])),
      listDepartments().then((r) => (Array.isArray(r.data) ? r.data : [])),
      listEnrollments().then((r) => (Array.isArray(r.data) ? r.data : [])),
    ])
    set({
      stats: {
        students: students.length,
        teachers: teachers.length,
        courses: courses.length,
        departments: departments.length,
        enrollments: enrollments.length,
      },
    })
  },
}))

export const selectStats = (state: DashboardState) => state.stats
export const selectFetchStats = (state: DashboardState) => state.fetchStats

export default useDashboardStore
