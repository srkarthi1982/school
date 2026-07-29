import { create } from 'zustand'
import * as api from '../../api/generated';
import type { AttendanceStatusResponse, LessonResponse, SuccessResponseListPersonnelStudentMember, PersonnelCourseResponse } from '../../api/generated';
export interface User {
  id: number
  name: string
  roleId: number
}
export interface GradeEntry {
  id: number
  subject: string
  code: string
  grade: string
  percent: number
  trend: 'up' | 'down' | 'flat'
}
export interface AttendanceDay {
  date: string
  status: 'present' | 'absent' | 'late' | 'excused' | 'off' | 'simulation' | 'flying'
}
export interface Attendance {
  user: string
  status: 'present' | 'absent' | 'late' | 'excused' | 'off' | 'simulation' | 'flying'
}
export interface AttendanceRecord {
  id: number
  subject: string
  date: string
  status: 'present' | 'absent' | 'late' | 'excused'
  note?: string
}
export type ViewMode = 'daily-attendance' | 'class-attendance'

interface GradingAttendanceDefaultState {
  page: number
  lessonTitle: string
  selectedDate: string
  selectedCourse: string
  selectedLesson: string
  selectedStudent: string
  // Concrete session-schedule placement to scope attendance to (per-session
  // capture from Schedule Management). Null = legacy/daily (no session scope).
  selectedPlacement: number | null
  searchLesson: string
  attendanceType: ViewMode
  showAttendanceModal: boolean
  showStatusConfigurationModal: boolean
  setPage: (page: number, userId: number) => Promise<void>
  // Pre-fill course+lesson+date+placement from the "Capture attendance" deep link.
  applyAttendanceContext: (
    courseId: string,
    lessonId: string,
    date: string | null,
    placementId: number | null,
    userId: number,
  ) => Promise<void>
  onDateChanged: (selectedDate: string, user_id: number) => Promise<void>
  onCourseChanged: (selectedCourse: string) => Promise<void>
  onLessonChanged: (selectedLesson: string, user_id: number) => Promise<void>
  onSearchLessonChanged: (searchLesson: string) => void
  onStudentChanged: any
  onAttendanceTypeChanged: (attendanceType: ViewMode, userId: number) => Promise<void>
  onShowAttendanceChanged: any
  onShowStatusConfigurationChanged: any
  grades: GradeEntry[]
  courses: PersonnelCourseResponse[]
  students: SuccessResponseListPersonnelStudentMember
  lessons: LessonResponse[]
  filteredLessons: LessonResponse[]
  attendanceStatusList: AttendanceStatusResponse[]
  attendanceMonth: AttendanceDay[]
  attendanceRecords: AttendanceRecord[]
  getCourses: () => Promise<void>
  getStudents: (date: string, lesson_id: number, page?: number, pageSize?: number, student_id?: number) => Promise<void>
  getLessons: (course_id: number) => Promise<void>
  getAttendanceStatusList: () => Promise<void>
  postAttendance: (student_id: number, lesson_id: number, date: string, status_id: number, locked: boolean, level: number, createdby: number, userId: number) => Promise<void>
  putAttendance: (attendance_id: number, student_id: number, lesson_id: number, date: string, status_id: number, locked: boolean, level: number, modifiedby: number, userId: number) => Promise<void>
  deleteAttendance: (attendance_id: number, userId: number) => Promise<void>
  postAttendanceStatus: (attendanceStatus: AttendanceStatusResponse) => Promise<void>
  putAttendanceStatus: (attendanceStatus: AttendanceStatusResponse) => Promise<void>
  deleteAttendanceStatus: (id: number) => Promise<void>
  stats: {
    presentRate: number
    absentCount: number
    lateCount: number
    averageGrade: string
  }
}
const useGradingAttendanceDefaultStore = create<GradingAttendanceDefaultState>((set, get) => ({
  page: 0,
  lessonTitle: '',
  selectedDate: new Date().toISOString().split('T')[0],
  selectedCourse: '0',
  selectedLesson: '0',
  selectedStudent: '0',
  selectedPlacement: null,
  searchLesson: '',
  attendanceType: 'daily-attendance',
  showAttendanceModal: false,
  showStatusConfigurationModal: false,
  setPage: async (page: number, userId: number) => {
    const { selectedDate, selectedLesson, getStudents } = get();
    await getStudents(selectedDate, Number(selectedLesson), page + 1, 12, userId);
    set({ page });
  },
  getCourses: async () => {
    const { getLessons } = get();
    const response = (await api.listPersonnelCoursesApiV1CoursesPersonnelCoursesGet()).data;
    if (response?.success) {
      let courses = response.data || [];
      let selectedCourse = response.data?.length ? response.data[0]?.id.toString() : '';
      await getLessons(Number(selectedCourse));
      set({ selectedCourse, courses });
    }
  },
  getStudents: async (date: string, lesson_id: number, page?: number, page_size?: number, user_id?: number) => {
    const { selectedCourse, selectedPlacement } = get();
    const query: any = { lesson_id: lesson_id || null, attendance_date: date, user_id: user_id || null, session_placement_id: selectedPlacement ?? null };
    if (page !== undefined) query.page = page;
    if (page_size !== undefined) query.page_size = page_size;
    const studentsResponse = (await api.listCourseStudentsApiV1CoursesCourseIdPersonnelStudentsGet({ path: { course_id: Number(selectedCourse) }, query })).data;
    if (studentsResponse?.success) set({ students: studentsResponse });
  },
  getLessons: async (course_id: number) => {
    const response = (await api.listLessonsByCourseInstanceApiV1CoursesCourseIdLessonsGet({ path: { course_id } })).data;
    if (response?.success) set({ lessons: response.data, filteredLessons: response.data });
  },
  getAttendanceStatusList: async () => {
    const response = (await api.listAttendanceStatusesApiV1AttendanceStatusGet({ query: { sort_by: 'name', sort_order: 'asc' } })).data;
    if (response?.success) set({ attendanceStatusList: response.data });
  },
  postAttendance: async (student_id: number, lesson_id: number, date: string, status_id: number, locked: boolean, level: number, createdby: number, userId: number) => {
    const { page, selectedDate, selectedLesson, selectedPlacement, getStudents } = get();
    const payload = { student_id, lesson_id: lesson_id || null, date, status_id, locked, level, user_id: createdby, session_placement_id: selectedPlacement ?? null };
    const response = (await api.createAttendanceApiV1AttendancePost({ body: payload })).data;
    if (response?.success) await getStudents(selectedDate, Number(selectedLesson), page + 1, 12, userId);
  },
  putAttendance: async (attendance_id: number, student_id: number, lesson_id: number, date: string, status_id: number, locked: boolean, level: number, modifiedby: number, userId: number) => {
    const { page, selectedDate, selectedLesson, selectedPlacement, getStudents } = get();
    const payload = { student_id, lesson_id: lesson_id || null, date, status_id, locked, level, user_id: modifiedby, session_placement_id: selectedPlacement ?? null };
    const response = (await api.updateAttendanceApiV1AttendanceAttendanceIdPut({ body: payload, path: { attendance_id } })).data;
    if (response?.success) await getStudents(selectedDate, Number(selectedLesson), page + 1, 12, userId);
  },
  deleteAttendance: async (attendance_id: number, userId: number) => {
    const { page, selectedDate, selectedLesson, getStudents } = get();
    (await api.deleteAttendanceApiV1AttendanceAttendanceIdDelete({ path: { attendance_id } })).data;
    await getStudents(selectedDate, Number(selectedLesson), page + 1, 12, userId);
  },
  postAttendanceStatus: async (attendanceStatus: AttendanceStatusResponse) => {
    const { getAttendanceStatusList } = get();
    const { code, name, color } = attendanceStatus
    const response = (await api.createAttendanceStatusApiV1AttendanceStatusPost({ body: { code, name, color } })).data;
    if (response?.success) await getAttendanceStatusList();
  },
  putAttendanceStatus: async (attendanceStatus: AttendanceStatusResponse) => {
    const { getAttendanceStatusList } = get();
    const { id, code, name, color } = attendanceStatus
    const response = (await api.updateAttendanceStatusApiV1AttendanceStatusStatusIdPut({ body: { code, name, color }, path: { status_id: id } })).data;
    if (response?.success) await getAttendanceStatusList();
  },
  deleteAttendanceStatus: async (id: number) => {
    const { getAttendanceStatusList } = get();
    (await api.deleteAttendanceStatusApiV1AttendanceStatusStatusIdDelete({ path: { status_id: id } })).data;
    await getAttendanceStatusList();
  },
  onDateChanged: async (selectedDate: string, user_id: number) => {
    const { selectedLesson, getStudents } = get();
    set({ page: 0, selectedDate });
    await getStudents(selectedDate, Number(selectedLesson), 1, 12, user_id);
  },
  onCourseChanged: async (selectedCourse: string) => {
    const { getLessons } = get();
    set({ page: 0, selectedCourse });
    await getLessons(Number(selectedCourse));
  },
  onLessonChanged: async (selectedLesson: string, user_id: number) => {
    const { selectedDate, getStudents, lessons } = get();
    const lesson = lessons.find(x => x.id === Number(selectedLesson));
    const lessonTitle = `${lesson?.lesson_number} - ${lesson?.title}` || '';
    set({ page: 0, selectedLesson, lessonTitle, students: { success: false, data: [], meta: null } });
    if (selectedLesson !== '0') await getStudents(selectedDate, Number(selectedLesson), 1, 12, user_id);
  },
  onSearchLessonChanged: (searchLesson: string) => {
    const {lessons} = get();
    const filteredLessons = searchLesson ? lessons.filter(x => x.title?.toUpperCase()?.includes(searchLesson.toUpperCase()) || x.lesson_number?.includes(searchLesson.toUpperCase())) : [...lessons];
    set({ searchLesson, filteredLessons });
  },
  onStudentChanged: async (selectedStudent: string) => set({ selectedStudent }),
  onAttendanceTypeChanged: async (attendanceType: ViewMode, userId: number) => {
    const { selectedDate, getStudents, getCourses, getAttendanceStatusList } = get();
    await getAttendanceStatusList();
    if (attendanceType.includes('class-attendance')) {
      await getCourses();
    } else await getStudents(selectedDate, 0, 1, 12, userId);
    // Fresh entry clears any session scope; a deep link re-applies it after.
    set({ page: 0, attendanceType, selectedLesson: '0', selectedCourse: '0', selectedPlacement: null });
  },
  applyAttendanceContext: async (courseId: string, lessonId: string, date: string | null, placementId: number | null, userId: number) => {
    // Set the session scope BEFORE fetching so getStudents/post/put pick it up.
    set({ page: 0, selectedPlacement: placementId, selectedCourse: courseId, ...(date ? { selectedDate: date } : {}) });
    await get().getLessons(Number(courseId));
    const lesson = get().lessons.find(x => x.id === Number(lessonId));
    const lessonTitle = lesson ? `${lesson.lesson_number} - ${lesson.title}` : '';
    set({ selectedLesson: String(lessonId), lessonTitle });
    await get().getStudents(get().selectedDate, Number(lessonId), 1, 12, userId);
  },
  onShowAttendanceChanged: (showAttendanceModal: boolean) => set({ showAttendanceModal }),
  onShowStatusConfigurationChanged: (showStatusConfigurationModal: boolean) => set({ showStatusConfigurationModal }),
  students: { success: false, data: [], meta: null },
  grades: [
    { id: 1, subject: 'Computer Science', code: 'CS101', grade: 'A', percent: 92, trend: 'up' },
    { id: 2, subject: 'Mathematics', code: 'MATH201', grade: 'B+', percent: 85, trend: 'up' },
    { id: 3, subject: 'Arabic Language', code: 'ARB110', grade: 'A-', percent: 89, trend: 'flat' },
    { id: 4, subject: 'History', code: 'HIS120', grade: 'B', percent: 78, trend: 'down' },
    { id: 5, subject: 'Physics', code: 'PHY103', grade: 'A', percent: 94, trend: 'up' },
  ],
  attendanceMonth: [
    { date: '01', status: 'off' }, { date: '02', status: 'present' }, { date: '03', status: 'present' },
    { date: '04', status: 'present' }, { date: '05', status: 'late' }, { date: '06', status: 'present' },
    { date: '07', status: 'present' }, { date: '08', status: 'off' }, { date: '09', status: 'absent' },
    { date: '10', status: 'present' }, { date: '11', status: 'present' }, { date: '12', status: 'present' },
    { date: '13', status: 'excused' }, { date: '14', status: 'present' }, { date: '15', status: 'off' },
    { date: '16', status: 'present' }, { date: '17', status: 'present' }, { date: '18', status: 'late' },
    { date: '19', status: 'present' }, { date: '20', status: 'present' }, { date: '21', status: 'off' },
    { date: '22', status: 'off' }, { date: '23', status: 'present' }, { date: '24', status: 'present' },
    { date: '25', status: 'present' }, { date: '26', status: 'present' }, { date: '27', status: 'absent' },
    { date: '28', status: 'off' }, { date: '29', status: 'off' }, { date: '30', status: 'present' },
  ],
  courses: [],
  lessons: [],
  filteredLessons: [],
  enrollments: [],
  attendanceStatusList: [],
  attendanceRecords: [
    { id: 1, subject: 'Mathematics', date: 'Apr 19, 2026', status: 'present' },
    { id: 2, subject: 'Computer Science', date: 'Apr 18, 2026', status: 'late', note: 'Arrived 10 min late' },
    { id: 3, subject: 'History', date: 'Apr 17, 2026', status: 'present' },
    { id: 4, subject: 'Physics', date: 'Apr 16, 2026', status: 'excused', note: 'Medical appointment' },
    { id: 5, subject: 'Arabic Language', date: 'Apr 15, 2026', status: 'present' },
    { id: 6, subject: 'Computer Science', date: 'Apr 14, 2026', status: 'absent' },
  ],
  stats: {
    presentRate: 88,
    absentCount: 3,
    lateCount: 2,
    averageGrade: 'A-',
  },
}))

export default useGradingAttendanceDefaultStore
