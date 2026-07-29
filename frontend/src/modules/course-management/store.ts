import { create } from 'zustand'
import { listMyClassmatesApiV1CoursesClassmatesGet, listMyCoursesApiV1CoursesMyGet, listStudentsByCourseApiV1CoursesCourseIdStudentsGet, MyCourseItemResponse, StudentProfileResponse } from '../../api/generated'

export type CourseItem = MyCourseItemResponse

export interface EnrollmentEntry {
  id: number
  name: string
  studentId: string
  course: string
  gpa: string
  enrolled: boolean
}

export interface MaterialItem {
  id: number
  title: string
  course: string
  type: 'pdf' | 'doc' | 'slide' | 'video'
  size: string
}

export interface AnnouncementItem {
  id: number
  title: string
  body: string
  course: string
  priority: 'normal' | 'urgent'
  date: string
}

export type StudentProfile = StudentProfileResponse

export interface CourseRegistered {
  course_id: number
  student_id: number
}

interface CourseManagementDefaultState {
  courses: CourseItem[]
  enrolledStudents: StudentProfile[]
  materials: MaterialItem[]
  announcements: AnnouncementItem[]
  students: StudentProfile[]
  // courseRegistered: CourseRegistered[]
  listMyCourses: () => Promise<void>
  listStudentsByCourse: (course_id: number) => Promise<void>
  listMyClassmates: () => Promise<void>
}

const useCourseManagementDefaultStore = create<CourseManagementDefaultState>((set,) => ({
  courses: [],
  enrolledStudents: [],

  materials: [
    { id: 1, title: 'Week 1 — Course Overview & Setup', course: 'CS101', type: 'pdf', size: '2.4 MB' },
    { id: 2, title: 'Week 3 — Python Basics Cheat Sheet', course: 'CS101', type: 'pdf', size: '1.1 MB' },
    { id: 3, title: 'Week 5 — Linked Lists Presentation', course: 'CS101', type: 'slide', size: '5.8 MB' },
    { id: 4, title: 'Week 8 — Mid-term Sample Questions', course: 'CS101', type: 'doc', size: '890 KB' },
    { id: 5, title: 'Chapter 4 — Ancient Trade Routes', course: 'HIS120', type: 'pdf', size: '3.2 MB' },
    { id: 6, title: 'Timeline Template — Islamic Era', course: 'HIS120', type: 'doc', size: '1.5 MB' },
    { id: 7, title: 'Integration Practice Set #7', course: 'MATH201', type: 'pdf', size: '780 KB' },
    { id: 8, title: 'Video Lecture — Series Convergence', course: 'MATH201', type: 'video', size: '120 MB' },
    { id: 9, title: 'Classical Poetry Analysis Guide', course: 'ARB110', type: 'pdf', size: '2.1 MB' },
    { id: 10, title: 'Lab 2 — Newton\'s Laws Simulation', course: 'PHY103', type: 'doc', size: '4.3 MB' },
  ],

  announcements: [
    {
      id: 1,
      title: 'Mid-term Exam Schedule Updated',
      body: 'The mid-term exam for CS101 has been moved from April 25 to April 28. Please check the updated timetable and arrive 10 minutes early.',
      course: 'CS101',
      priority: 'urgent',
      date: 'Apr 20, 2026 · 09:30 AM',
    },
    {
      id: 2,
      title: 'Guest Speaker — AI in Education',
      body: 'Dr. Sara Kim from MIT will give a talk on AI-driven personalized learning on April 26 at 2:00 PM in Lec-101. All students are welcome.',
      course: 'CS101',
      priority: 'normal',
      date: 'Apr 18, 2026 · 02:15 PM',
    },
    {
      id: 3,
      title: 'Assignment 3 — Extension Notice',
      body: 'Due to the holiday weekend, Assignment 3 for HIS120 is extended to April 22. Late submissions will incur a 10% penalty per day.',
      course: 'HIS120',
      priority: 'urgent',
      date: 'Apr 17, 2026 · 11:00 AM',
    },
    {
      id: 4,
      title: 'Lab Session Cancelled — PHY103',
      body: 'Lab-201 is undergoing maintenance. The PHY103 lab session on April 24 is cancelled and will be rescheduled next week.',
      course: 'PHY103',
      priority: 'urgent',
      date: 'Apr 15, 2026 · 08:45 AM',
    },
    {
      id: 5,
      title: 'Reading List for Spring Break',
      body: 'Recommended readings for the spring break period have been posted. These will not be graded but may appear in the final exam scope.',
      course: 'ARB110',
      priority: 'normal',
      date: 'Apr 12, 2026 · 04:00 PM',
    },
  ],

  students: [],
  // courseRegistered: [
  //   // Foundational & Tactical (Courses 1, 2, 7)
  //   { course_id: 1, student_id: 8 },
  //   { course_id: 2, student_id: 8 },
  //   { course_id: 1, student_id: 9 },
  //   { course_id: 1, student_id: 10 },
  //   { course_id: 2, student_id: 14 },
  //   { course_id: 1, student_id: 14 },
  //   { course_id: 2, student_id: 15 },
  //   { course_id: 1, student_id: 16 },
  //   { course_id: 7, student_id: 16 },
  //   { course_id: 1, student_id: 20 },
  //   { course_id: 2, student_id: 21 },
  //   { course_id: 7, student_id: 22 },
  //   { course_id: 1, student_id: 26 },
  //   { course_id: 1, student_id: 28 },
  //   { course_id: 2, student_id: 28 },
  //   { course_id: 7, student_id: 32 },
  //   { course_id: 1, student_id: 34 },
  //   { course_id: 1, student_id: 35 },
  //   { course_id: 2, student_id: 36 },

  //   // Medical & Survival (Course 3)
  //   { course_id: 3, student_id: 9 },
  //   { course_id: 3, student_id: 11 },
  //   { course_id: 3, student_id: 17 },
  //   { course_id: 3, student_id: 23 },
  //   { course_id: 3, student_id: 30 },
  //   { course_id: 3, student_id: 37 },

  //   // Engineering & Maintenance (Course 4)
  //   { course_id: 4, student_id: 11 },
  //   { course_id: 4, student_id: 12 },
  //   { course_id: 4, student_id: 13 },
  //   { course_id: 4, student_id: 19 },
  //   { course_id: 4, student_id: 25 },
  //   { course_id: 4, student_id: 31 },

  //   // Navigation & GIS (Course 5)
  //   { course_id: 5, student_id: 19 },
  //   { course_id: 5, student_id: 31 },

  //   // Communications (Course 6)
  //   { course_id: 6, student_id: 21 },
  //   { course_id: 6, student_id: 29 },
  //   { course_id: 6, student_id: 34 },

  //   // Logistics (Course 8)
  //   { course_id: 8, student_id: 25 },
  //   { course_id: 8, student_id: 27 },

  //   // Cybersecurity (Course 9)
  //   { course_id: 9, student_id: 13 },
  //   { course_id: 9, student_id: 27 },

  //   // Leadership & Command (Course 10)
  //   { course_id: 10, student_id: 18 },
  //   { course_id: 10, student_id: 24 },
  //   { course_id: 10, student_id: 29 },
  //   { course_id: 10, student_id: 33 },
  //   { course_id: 10, student_id: 36 }
  // ],
  listMyCourses: async () => {
    const { data } = await listMyCoursesApiV1CoursesMyGet()
    if ((data as any)?.success) {
      set({ courses: data?.data })
    }
  },
  listStudentsByCourse: async (course_id: number) => {
    const { data } = await listStudentsByCourseApiV1CoursesCourseIdStudentsGet({ path: { course_id } })
    if ((data as any)?.success) {
      set({ enrolledStudents: data?.data })
    }
  },
  listMyClassmates: async() => {
    const { data } = await listMyClassmatesApiV1CoursesClassmatesGet()
    if ((data as any)?.success) {
      set({ students: data?.data })
    }

  }
}))

export default useCourseManagementDefaultStore
