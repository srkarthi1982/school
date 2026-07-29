import { create } from "zustand"
import { getColorById } from "./utils"
import { client } from "../../../api/client"
import {
  getStudentOverviewApiV1ProgressTrackerStudentOverviewGet,
  getObserverOverviewApiV1ProgressTrackerObserverOverviewGet,
  getStudentAttendanceApiV1ProgressTrackerStudentAttendanceGet,
  getStudentAssessmentApiV1ProgressTrackerStudentAssessmentGet,
  getStudentMaterialsApiV1ProgressTrackerStudentMaterialsGet,
  getObserverAttendanceApiV1ProgressTrackerObserverAttendanceGet,
  getObserverAssessmentApiV1ProgressTrackerObserverAssessmentGet,
  getObserverMaterialsApiV1ProgressTrackerObserverMaterialsGet,
} from "../../../api/generated"

type StudentViewMode = "overview" | "attendance" | "assessment" | "materials" | "lessons"
type ViewMode = "overview" | "attendance" | "assessment" | "materials" | "lessons"
export type ViewRole = "student" | "teacher" | "teacher_student" | "admin"

export type CourseProgress = {
  courseId: number
  courseName: string
  teacherName: string
  color: string
  attendanceRate: number
  assessmentAverage: number
  materialsCompleted: number
  materialsTotal: number
  materialsCompletionRate: number
  overallProgress: number
}

export type TeacherCourseProgress = {
  courseId: number
  courseName: string
  teacherName: string
  color: string
  studentCount: number
  averageAttendanceRate: number
  averageQuizScore: number
  averageSurveyScore: number
  averageFormScore: number
  averageFlightScore: number
  averageAssessmentScore: number
  averageMaterialsCompletionRate: number
  lowPerformers: number
  startDate?: string
  endDate?: string
}

export type AttendanceRecord = {
  courseId: number
  courseName: string
  date: string
  status: "present" | "absent" | "late" | "excused" | "simulation" | "flying"
}

export type QuizRecord = {
  quizId: number
  courseId: number
  courseName: string
  title: string
  score: number
  total: number
  date: string
  status: "completed" | "pending" | "missing"
  assessmentType: "quiz" | "survey" | "form" | "flight"
}

export type CourseMaterialRecord = {
  materialId: number
  courseId: number
  courseName: string
  title: string
  type: "video" | "document" | "reading" | "assignment"
  completed: boolean
  totalDuration?: number | undefined
  watchedDuration?: number | undefined
  dateAdded: string
}

export type LessonRecord = {
  courseId: number
  courseName: string
  lessonId: number
  lessonNumber: string | null
  lessonTitle: string
  completed: boolean
  completedBy: string | null
  completedAt: string | null
}

export type TeacherLessonRecord = {
  courseId: number
  courseName: string
  lessonId: number
  lessonNumber: string | null
  lessonTitle: string
  completed: boolean
  studentsTotal: number
  studentsCompleted: number
}

export type LessonStudentRecord = {
  studentId: number
  studentName: string
  completed: boolean
  completedBy: string | null
  completedAt: string | null
}

export type StudentAttendanceRecord = {
  courseId: number
  courseName: string
  studentId: number
  studentName: string
  date: string
  status: "present" | "absent" | "late" | "excused" | "simulation" | "flying"
  attendanceRate: number
  presentCount: number
  absentCount: number
  lateCount: number
  excusedCount: number
  simulationCount: number
  flyingCount: number
}

export type StudentQuizRecord = {
  quizId: number
  courseId: number
  courseName: string
  studentId: number
  studentName: string
  title: string
  score: number | null
  total: number | null
  date: string
  releasedAt: string | null
  status: "completed" | "pending" | "missing"
  assessmentType: "quiz" | "survey" | "form" | "flight"
}

export type StudentMaterialRecord = {
  materialId: number
  courseId: number
  courseName: string
  studentId: number
  studentName: string
  title: string
  type: "video" | "document" | "reading" | "assignment"
  completed: boolean
  totalDuration?: number | undefined
  watchedDuration?: number | undefined
  dateAdded: string
}

// ===================================================================
// Transform helpers
// ===================================================================

const toCourseProgress = (raw: any): CourseProgress => ({
  courseId: raw.course_id,
  courseName: raw.course_name || "",
  teacherName: raw.teacher_name,
  color: getColorById(raw.course_id),
  attendanceRate: raw.attendance_rate,
  assessmentAverage: raw.assessment_average,
  materialsCompleted: raw.materials_completed,
  materialsTotal: raw.materials_total,
  materialsCompletionRate: raw.materials_completion_rate,
  overallProgress: raw.overall_progress,
})

const toTeacherCourseProgress = (raw: any): TeacherCourseProgress => ({
  courseId: raw.course_id,
  courseName: raw.course_name || "",
  teacherName: raw.teacher_name,
  color: getColorById(raw.course_id),
  studentCount: raw.student_count,
  averageAttendanceRate: raw.average_attendance_rate,
  averageQuizScore: raw.average_quiz_score,
  averageSurveyScore: raw.average_survey_score,
  averageFormScore: raw.average_form_score,
  averageFlightScore: raw.average_flight_score,
  averageAssessmentScore: raw.average_assessment_score,
  averageMaterialsCompletionRate: raw.average_materials_completion_rate,
  lowPerformers: raw.low_performers,
  startDate: raw.start_date,
  endDate: raw.end_date,
})

// The SDK returns { data: parsedJSON, ... } where parsedJSON is { success, data, meta }
// So res.data is the SuccessResponse, and res.data.data is the actual payload
const unwrap = (res: Record<string, any>): any => {
  if (!res?.data) return null
  return res.data.data ?? res.data
}

// For array responses, unwrap and coerce to array
const toArr = (res: Record<string, any>): any[] => {
  const d = unwrap(res)
  return Array.isArray(d) ? d : []
}

// Unwrap response that may include an "extra" field with courseDateRanges
const toArrWithExtra = (res: Record<string, any>): { data: any[]; extra: Record<string, any> | null } => {
  const wrapped = res?.data
  if (!wrapped) return { data: [], extra: null }
  const data = Array.isArray(wrapped.data) ? wrapped.data : (Array.isArray(wrapped) ? wrapped : [])
  const extra = wrapped.extra ?? null
  return { data, extra }
}

// For attendance drilldown which returns { data: { records: [...], aggregatedStats: {...} }, extra: {...} }
const toArrWithExtraRecords = (res: Record<string, any>): { records: any[]; aggregatedStats: any; extra: Record<string, any> | null } => {
  const wrapped = res?.data
  if (!wrapped) return { records: [], aggregatedStats: null, extra: null }
  const extra = wrapped.extra ?? null
  const innerData = wrapped.data ?? wrapped
  return {
    records: Array.isArray(innerData?.records) ? innerData.records : [],
    aggregatedStats: innerData?.aggregatedStats ?? null,
    extra,
  }
}

const _courseCache = new Map<number, { name: string; teacherName: string; color: string }>()

const enrollCourseCache = (courses: CourseProgress[]) => {
  for (const c of courses) {
    _courseCache.set(c.courseId, { name: c.courseName, teacherName: c.teacherName, color: c.color })
  }
}

const toAttendanceRecord = (raw: any): AttendanceRecord => ({
  courseId: raw.course_id,
  courseName: raw.course_name || _courseCache.get(raw.course_id)?.name || `Course ${raw.course_id}`,
  date: raw.date,
  status: raw.status as AttendanceRecord["status"],
})

const toQuizRecord = (raw: any): QuizRecord => ({
  quizId: raw.id,
  courseId: raw.course_id,
  courseName: raw.course_name || _courseCache.get(raw.course_id)?.name || `Course ${raw.course_id}`,
  title: raw.title,
  score: raw.score ?? 0,
  total: raw.total,
  date: raw.date,
  status: raw.status as QuizRecord["status"],
  assessmentType: (raw.assessment_type || "quiz") as QuizRecord["assessmentType"],
})

const toMaterialRecord = (raw: any): CourseMaterialRecord => ({
  materialId: raw.id,
  courseId: raw.course_id,
  courseName: raw.course_name || _courseCache.get(raw.course_id)?.name || `Course ${raw.course_id}`,
  title: raw.title,
  type: raw.material_type as CourseMaterialRecord["type"],
  completed: raw.completed,
  totalDuration: raw.total_duration ?? undefined,
  watchedDuration: raw.watched_duration ?? undefined,
  dateAdded: raw.date_added,
})

const toLessonRecord = (raw: any): LessonRecord => ({
  courseId: raw.course_id,
  courseName: raw.course_name || _courseCache.get(raw.course_id)?.name || `Course ${raw.course_id}`,
  lessonId: raw.lesson_id,
  lessonNumber: raw.lesson_number ?? null,
  lessonTitle: raw.lesson_title || `Lesson ${raw.lesson_id}`,
  completed: !!raw.completed,
  completedBy: raw.completed_by ?? null,
  completedAt: raw.completed_at ?? null,
})

const toTeacherLessonRecord = (raw: any): TeacherLessonRecord => ({
  courseId: raw.course_id,
  courseName: raw.course_name || _courseCache.get(raw.course_id)?.name || `Course ${raw.course_id}`,
  lessonId: raw.lesson_id,
  lessonNumber: raw.lesson_number ?? null,
  lessonTitle: raw.lesson_title || `Lesson ${raw.lesson_id}`,
  completed: !!raw.completed,
  studentsTotal: raw.students_total ?? 0,
  studentsCompleted: raw.students_completed ?? 0,
})

const toLessonStudentRecord = (raw: any): LessonStudentRecord => ({
  studentId: raw.student_id,
  studentName: raw.student_name || `Student ${raw.student_id}`,
  completed: !!raw.completed,
  completedBy: raw.completed_by ?? null,
  completedAt: raw.completed_at ?? null,
})

const toStudentAttendanceRecord = (raw: any): StudentAttendanceRecord => ({
  courseId: raw.course_id,
  courseName: raw.course_name || _courseCache.get(raw.course_id)?.name || `Course ${raw.course_id}`,
  studentId: raw.student_id,
  studentName: raw.studentName || raw.student_name || `Student ${raw.student_id}`,
  date: raw.date,
  status: raw.status as StudentAttendanceRecord["status"],
  attendanceRate: raw.attendance_rate ?? 0,
  presentCount: raw.present_count ?? 0,
  absentCount: raw.absent_count ?? 0,
  lateCount: raw.late_count ?? 0,
  excusedCount: raw.excused_count ?? 0,
  simulationCount: raw.simulation_count ?? 0,
  flyingCount: raw.flying_count ?? 0,
})

const toStudentQuizRecord = (raw: any): StudentQuizRecord => ({
  quizId: raw.id,
  courseId: raw.course_id,
  courseName: raw.course_name || _courseCache.get(raw.course_id)?.name || `Course ${raw.course_id}`,
  studentId: raw.student_id,
  studentName: raw.student_name || `Student ${raw.student_id}`,
  title: raw.title,
  score: raw.score,
  total: raw.total,
  date: raw.status === 'completed' ? raw.date : raw.released_at,
  releasedAt: raw.released_at,
  status: raw.status as StudentQuizRecord["status"],
  assessmentType: (raw.assessment_type || "quiz") as StudentQuizRecord["assessmentType"],
})

const toStudentMaterialRecord = (raw: any): StudentMaterialRecord => ({
  materialId: raw.id,
  courseId: raw.course_id,
  courseName: raw.course_name || _courseCache.get(raw.course_id)?.name || `Course ${raw.course_id}`,
  studentId: raw.student_id,
  studentName: raw.student_name || `Student ${raw.student_id}`,
  title: raw.title,
  type: raw.material_type as StudentMaterialRecord["type"],
  completed: raw.completed,
  totalDuration: raw.total_duration ?? undefined,
  watchedDuration: raw.watched_duration ?? undefined,
  dateAdded: raw.date_added,
})

// ===================================================================
// Store
// ===================================================================

interface ProgressState {
  courses: CourseProgress[]
  teacherCourses: TeacherCourseProgress[]
  teacherOverview: {
    overall_quiz_avg: number
    overall_survey_avg: number
    overall_form_avg: number
    overall_flight_avg: number
  }
  studentOverview: {
    overall: number
    attendance: number
    overall_quiz_avg: number
    overall_survey_avg: number
    overall_form_avg: number
    overall_flight_avg: number
    overall_assessment_avg: number
    materials: number
  }
  studentStats: Record<number, {
    attendanceRate: number
    presentCount: number
    absentCount: number
    excusedCount: number
    lateCount: number
    simulationCount: number
    flyingCount: number
  }>
  attendance: AttendanceRecord[]
  quizzes: QuizRecord[]
  materials: CourseMaterialRecord[]
  lessons: LessonRecord[]
  studentAttendance: StudentAttendanceRecord[]
  studentQuizzes: StudentQuizRecord[]
  studentMaterials: StudentMaterialRecord[]
  teacherLessons: TeacherLessonRecord[]
  teacherLessonStudents: LessonStudentRecord[]
  courseDateRanges: Record<number, { start_date: string | null; end_date: string | null }>
  holidays: string[]
  drilldownLoading: Record<string, boolean>
  attendanceAggregatedStats: {
    present: number
    absent: number
    late: number
    excused: number
    simulation: number
    flying: number
    total: number
  }
  selectedCourseId: number | null
  selectedPerspective: "student" | "other"
  loading: boolean
  setCourseId: (id: number | null) => void
  setPerspective: (p: "student" | "other") => void
  fetchStudentOverview: () => Promise<void>
  fetchTeacherOverview: () => Promise<void>
  fetchStudentDrilldown: (view: StudentViewMode, query?: { course_id?: number | null; status?: string | null; completed?: boolean | null; completion_state?: string | null }) => Promise<void>
  fetchTeacherDrilldown: (view: ViewMode, query?: { course_id?: number | null; student_id?: number | null; status?: string | null; completed?: boolean | null; completion_state?: string | null }) => Promise<void>
  fetchTeacherLessonStudents: (courseId: number, lessonId: number, status?: string | null) => Promise<void>
  fetchAll: () => Promise<void>
}

const PAGE_SIZE = 200

const _inFlight = new Set<string>()

const useProgressStore = create<ProgressState>((set, get) => ({
  courseDateRanges: {},
  holidays: [],
  drilldownLoading: {},
  teacherOverview: {
    overall_quiz_avg: 0,
    overall_survey_avg: 0,
    overall_form_avg: 0,
    overall_flight_avg: 0,
  },
  studentOverview: {
    overall: 0,
    attendance: 0,
    overall_quiz_avg: 0,
    overall_survey_avg: 0,
    overall_form_avg: 0,
    overall_flight_avg: 0,
    overall_assessment_avg: 0,
    materials: 0,
  },
  attendanceAggregatedStats: {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    simulation: 0,
    flying: 0,
    total: 0,
  },
  courses: [],
  teacherCourses: [],
  studentStats: {},
  attendance: [],
  quizzes: [],
  materials: [],
  lessons: [],
  studentAttendance: [],
  studentAttendanceRates: {},
  studentQuizzes: [],
  studentMaterials: [],
  teacherLessons: [],
  teacherLessonStudents: [],
  selectedCourseId: null,
  selectedPerspective: "student",
  loading: false,

  setCourseId: (id) => set({ selectedCourseId: id }),
  setPerspective: (p) => set({ selectedPerspective: p }),

  fetchStudentOverview: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const res = await getStudentOverviewApiV1ProgressTrackerStudentOverviewGet()
      const overview = unwrap(res) ?? {}
      const courses = Array.isArray(overview.courses) ? overview.courses.map(toCourseProgress) : []
      enrollCourseCache(courses)

      set({
        courses,
        studentOverview: {
          overall: overview.overall ?? 0,
          attendance: overview.attendance ?? 0,
          overall_quiz_avg: overview.overall_quiz_avg ?? 0,
          overall_survey_avg: overview.overall_survey_avg ?? 0,
          overall_form_avg: overview.overall_form_avg ?? 0,
          overall_flight_avg: overview.overall_flight_avg ?? 0,
          overall_assessment_avg: overview.overall_assessment_avg ?? 0,
          materials: overview.materials ?? 0,
        },
        studentStats: overview.perStudentStats || {},
        loading: false,
      })
    } catch (err) {
      set({ loading: false })
      console.error("Progress tracker fetch failed:", err)
    }
  },

  fetchTeacherOverview: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const res = await getObserverOverviewApiV1ProgressTrackerObserverOverviewGet()
      const resData = unwrap(res) ?? {}
      const teacherCourses = Array.isArray(resData.courses) ? resData.courses.map(toTeacherCourseProgress) : []

      const teacherOverview = {
        overall_quiz_avg: resData.overall_quiz_avg ?? 0,
        overall_survey_avg: resData.overall_survey_score ?? resData.overall_survey_avg ?? 0,
        overall_form_avg: resData.overall_form_score ?? resData.overall_form_avg ?? 0,
        overall_flight_avg: resData.overall_flight_score ?? resData.overall_flight_avg ?? 0,
      }

      const courseDateRanges: Record<number, { start_date: string | null; end_date: string | null }> = {}
      for (const tc of teacherCourses) {
        if (tc.startDate || tc.endDate) {
          courseDateRanges[tc.courseId] = {
            start_date: tc.startDate ?? null,
            end_date: tc.endDate ?? null,
          }
        }
      }

      set({
        teacherCourses,
        teacherOverview,
        courseDateRanges,
        loading: false,
      })
    } catch (err) {
      set({ loading: false })
      console.error("Progress tracker fetch failed:", err)
    }
  },

  fetchStudentDrilldown: async (view: StudentViewMode, query: { course_id?: number | null; status?: string | null; completed?: boolean | null; completion_state?: string | null } = {}) => {
    const state = get()
    if (state.drilldownLoading?.[view]) return
    const params = { page: 1, page_size: PAGE_SIZE } as Record<string, any>
    if (query.course_id != null) params.course_id = query.course_id
    if (query.status != null) params.status = query.status
    if (query.completed != null) params.completed = query.completed
    if (query.completion_state != null) params.completion_state = query.completion_state
    let res: Record<string, any>
    try {
      set((s) => ({ drilldownLoading: { ...s.drilldownLoading, [view]: true } }))
      if (view === "attendance") {
        res = await getStudentAttendanceApiV1ProgressTrackerStudentAttendanceGet({ query: params })
      } else if (view === "assessment") {
        res = await getStudentAssessmentApiV1ProgressTrackerStudentAssessmentGet({ query: params })
      } else if (view === "lessons") {
        res = await client.get({ url: "/api/v1/progress-tracker/student/lessons", query: params })
      } else {
        res = await getStudentMaterialsApiV1ProgressTrackerStudentMaterialsGet({ query: params })
      }
      if (view === "attendance") {
        const parsedAttendance = toArrWithExtraRecords(res)
        set((s) => ({
          attendance: parsedAttendance.records.map(toAttendanceRecord),
          courseDateRanges: parsedAttendance.extra?.courseDateRanges || s.courseDateRanges,
          holidays: parsedAttendance.extra?.holidays || s.holidays,
          drilldownLoading: { ...s.drilldownLoading, [view]: false }
        }))
      } else if (view === "assessment") {
        const data = toArr(res)
        set((s) => ({ quizzes: data.map(toQuizRecord), drilldownLoading: { ...s.drilldownLoading, [view]: false } }))
      } else if (view === "lessons") {
        const data = toArr(res)
        set((s) => ({ lessons: data.map(toLessonRecord), drilldownLoading: { ...s.drilldownLoading, [view]: false } }))
      } else {
        const data = toArr(res)
        set((s) => ({ materials: data.map(toMaterialRecord), drilldownLoading: { ...s.drilldownLoading, [view]: false } }))
      }
    } catch (err) {
      set((s) => ({ drilldownLoading: { ...s.drilldownLoading, [view]: false } }))
      console.error("Progress tracker drilldown fetch failed:", err)
    }
  },

  fetchTeacherDrilldown: async (view: ViewMode, query: { course_id?: number | null; student_id?: number | null; status?: string | null; completed?: boolean | null; completion_state?: string | null } = {}) => {
    const state = get()
    if (state.drilldownLoading?.[view]) return
    const params = { page: 1, page_size: PAGE_SIZE } as Record<string, any>
    if (query.course_id != null) params.course_id = query.course_id
    if (query.student_id != null) params.student_id = query.student_id
    if (query.status != null) params.status = query.status
    if (query.completed != null) params.completed = query.completed
    if (query.completion_state != null) params.completion_state = query.completion_state
    let res: Record<string, any>
    try {
      set((s) => ({ drilldownLoading: { ...s.drilldownLoading, [view]: true } }))
      if (view === "attendance") {
        res = await getObserverAttendanceApiV1ProgressTrackerObserverAttendanceGet({ query: params })
      } else if (view === "assessment") {
        res = await getObserverAssessmentApiV1ProgressTrackerObserverAssessmentGet({ query: params })
      } else if (view === "lessons") {
        res = await client.get({ url: "/api/v1/progress-tracker/observer/lessons", query: params })
      } else {
        res = await getObserverMaterialsApiV1ProgressTrackerObserverMaterialsGet({ query: params })
      }
      const parsedAttendance = toArrWithExtraRecords(res)
      const parsedOther = toArrWithExtra(res)
      if (view === "attendance") {
        set((s) => ({
          studentAttendance: parsedAttendance.records.map(toStudentAttendanceRecord),
          courseDateRanges: parsedAttendance.extra?.courseDateRanges || s.courseDateRanges,
          holidays: parsedAttendance.extra?.holidays || s.holidays,
          attendanceAggregatedStats: parsedAttendance.aggregatedStats ?? s.attendanceAggregatedStats,
          drilldownLoading: { ...s.drilldownLoading, [view]: false }
        }))
      } else if (view === "assessment") {
        set((s) => ({ studentQuizzes: parsedOther.data.map(toStudentQuizRecord), drilldownLoading: { ...s.drilldownLoading, [view]: false } }))
      } else if (view === "lessons") {
        const data = toArr(res)
        set((s) => ({ teacherLessons: data.map(toTeacherLessonRecord), drilldownLoading: { ...s.drilldownLoading, [view]: false } }))
      } else {
        set((s) => ({ studentMaterials: parsedOther.data.map(toStudentMaterialRecord), drilldownLoading: { ...s.drilldownLoading, [view]: false } }))
      }
    } catch (err) {
      set((s) => ({ drilldownLoading: { ...s.drilldownLoading, [view]: false } }))
      console.error("Progress tracker drilldown fetch failed:", err)
    }
  },

  fetchTeacherLessonStudents: async (courseId: number, lessonId: number, status: string | null = null) => {
    const key = "lessonStudents"
    if (get().drilldownLoading?.[key]) return
    const params = { page: 1, page_size: PAGE_SIZE, course_id: courseId, lesson_id: lessonId } as Record<string, any>
    if (status != null) params.status = status
    try {
      set((s) => ({ drilldownLoading: { ...s.drilldownLoading, [key]: true } }))
      const res = await client.get({ url: "/api/v1/progress-tracker/observer/lesson-students", query: params })
      const data = toArr(res)
      set((s) => ({ teacherLessonStudents: data.map(toLessonStudentRecord), drilldownLoading: { ...s.drilldownLoading, [key]: false } }))
    } catch (err) {
      set((s) => ({ drilldownLoading: { ...s.drilldownLoading, [key]: false } }))
      console.error("Progress tracker lesson-students fetch failed:", err)
    }
  },

  fetchAll: async () => {
    const { selectedPerspective } = get()
    if (selectedPerspective === "student") {
      await get().fetchStudentOverview()
    } else {
      await get().fetchTeacherOverview()
    }
  },
}))

export function computeCourseStats(courses: CourseProgress[]) {
  if (courses.length === 0) return { overall: 0, attendance: 0, quizzes: 0, materials: 0 }
  const count = courses.length
  return {
    overall: Math.round(courses.reduce((s, c) => s + c.overallProgress, 0) / count),
    attendance: Math.round(courses.reduce((s, c) => s + c.attendanceRate, 0) / count),
    quizzes: Math.round(courses.reduce((s, c) => s + c.assessmentAverage, 0) / count),
    materials: Math.round(courses.reduce((s, c) => s + c.materialsCompletionRate, 0) / count),
  }
}

export function computeTeacherCourseStats(courses: TeacherCourseProgress[]) {
  if (courses.length === 0) return { totalCourses: 0, totalStudents: 0, overallAttendance: 0, overallAssessmentAvg: 0, overallMaterialsCompletion: 0, atRiskStudents: 0 }
  const count = courses.length
  const totalStudents = courses.reduce((s, c) => s + c.studentCount, 0)
  const atRisk = courses.reduce((s, c) => s + c.lowPerformers, 0)
  return {
    totalCourses: count,
    totalStudents,
    overallAttendance: Math.round(courses.reduce((s, c) => s + c.averageAttendanceRate, 0) / count),
    overallAssessmentAvg: Math.round(courses.reduce((s, c) => s + c.averageAssessmentScore, 0) / count),
    overallMaterialsCompletion: Math.round(courses.reduce((s, c) => s + c.averageMaterialsCompletionRate, 0) / count),
    atRiskStudents: atRisk,
  }
}

export default useProgressStore
export type { StudentViewMode, ViewMode }
