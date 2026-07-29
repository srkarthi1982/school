// Read-only lesson detail for Schedule Management. One membership-gated backend
// call returns the lesson's own info plus the quizzes / forms / surveys /
// materials attached to it (see course_selection_schedule.read_lesson_detail).
// Hand-written adapter (like the schedule store's) so no SDK regen is needed.
import { client } from '../../../../api/client'

export interface LessonUnitDetail {
  trainingObjective: string | null
  enablingObjective: string | null
  teachingPoint: string | null
}

export interface LessonResourceDetail {
  label: string | null
  category: string | null
  categoryLabel: string | null
}

export interface LessonConductDetail {
  part: string | null
  point: string | null
  material: string | null
  notes: string | null
}

export interface LessonGeneralDetail {
  id: number
  lessonNumber: string | null
  lessonTitle: string | null
  environmentLabel: string | null
  periodTypeLabel: string | null
  totalPeriods: number
  periodPerUnit: number
  instructorStudentRatio: string | null
  location: string | null
  healthAndSafety: string | null
  units: LessonUnitDetail[]
  resources: LessonResourceDetail[]
  conducts: LessonConductDetail[]
}

// Per-lesson lifecycle flags shared by quiz/form/survey items. For a STUDENT
// viewer `released` = the teacher sent it to me and `completedByMe` = I took it.
// For a TEACHER viewer `released` = sent to at least one student, and the two id
// lists say exactly which enrolled students it's sent to and which have already
// taken it (the latter can't be unsent). The id lists are empty for students.
interface Releasable {
  released: boolean
  completedByMe: boolean
  releasedStudentIds: number[]
  completedStudentIds: number[]
}

export interface LessonContentQuiz extends Releasable {
  id: number
  quizId: number
  name: string
  description: string | null
  type: string | null
  questionCount: number
  assessmentType: string | null
  maxMark: number
  passMark: number
  passPercentage: number
}

export interface LessonContentForm extends Releasable {
  id: number
  formId: number
  title: string
  description: string | null
  status: string | null
  questionCount: number
}

export interface LessonContentSurvey extends Releasable {
  id: number
  surveyId: number
  title: string
  description: string | null
  status: string | null
  questionCount: number
}

export interface LessonContentMaterial {
  id: string
  filename: string
  contentType: string | null
  fileSize: number
  downloadUrl: string | null
  libraryMaterialId: number | null
}

export interface LessonFlightPackContent {
  id: number
  packageId: number
  packageName: string
  taskCount: number
}

export interface LessonTrackStudent {
  studentId: number
  fullName: string
  rank: string | null
  completed: boolean
  completedAt: string | null
  completedBy: string | null
  completedByMe: boolean
}

export interface ScheduleLessonDetail {
  courseInstanceId: number
  courseTitle: string | null
  // Backend-computed: viewer is an instructor of this course (or admin) → teacher
  // view (send to students). Membership-based, not role/permission-name-based.
  canManage: boolean
  lesson: LessonGeneralDetail
  quizzes: LessonContentQuiz[]
  evaluationForms: LessonContentForm[]
  surveys: LessonContentSurvey[]
  forms: LessonContentForm[]
  materials: LessonContentMaterial[]
  flightPacks: LessonFlightPackContent[]
  enrolledStudents: LessonTrackStudent[]
}

export async function fetchLessonDetail(
  courseInstanceId: number,
  lessonId: number,
): Promise<ScheduleLessonDetail> {
  const { data, error } = await (client as any).get({
    url: `/api/v1/course-selection-schedules/${courseInstanceId}/lessons/${lessonId}/detail`,
  })
  if (error) throw error
  return (data as { data: ScheduleLessonDetail }).data
}

export type LessonContentType = 'quiz' | 'form' | 'survey'

const base = (cid: number, lessonId: number) =>
  `/api/v1/course-selection-schedules/${cid}/lessons/${lessonId}`

// Teacher: set exactly which students a quiz/form/survey is released to for this
// lesson. `studentIds` is the full desired recipient set; the server releases to
// newly-listed students and revokes from omitted ones — except students who've
// already taken it, who always stay released. Passing [] unsends everyone who
// hasn't taken it; passing every enrolled id sends to all.
export async function setReleaseTargets(
  cid: number, lessonId: number, contentType: LessonContentType, contentId: number,
  studentIds: number[],
): Promise<ScheduleLessonDetail> {
  const { data, error } = await (client as any).post({
    url: `${base(cid, lessonId)}/releases`,
    body: { contentType, contentId, studentIds },
  })
  if (error) throw error
  return (data as { data: ScheduleLessonDetail }).data
}

// Teacher: revoke a release from every student who hasn't taken it yet.
export async function unreleaseContent(
  cid: number, lessonId: number, contentType: LessonContentType, contentId: number,
): Promise<ScheduleLessonDetail> {
  const { data, error } = await (client as any).delete({
    url: `${base(cid, lessonId)}/releases`,
    body: { contentType, contentId },
  })
  if (error) throw error
  return (data as { data: ScheduleLessonDetail }).data
}

// Record reading progress for a lesson material file (current user). The backend
// keys progress to the authenticated user and only advances pages_read.
export async function updateLessonMaterialProgress(
  cid: number, lessonId: number, fileId: string, pagesRead: number, totalPages: number,
): Promise<void> {
  const { error } = await (client as any).put({
    url: `${base(cid, lessonId)}/materials/${fileId}/progress`,
    body: { pages_read: pagesRead, total_pages: totalPages },
  })
  if (error) throw error
}

// Student: mark a released item as taken for this lesson (idempotent).
export async function markLessonCompletion(
  cid: number, lessonId: number, contentType: LessonContentType, contentId: number,
): Promise<void> {
  const { error } = await (client as any).post({
    url: `${base(cid, lessonId)}/completions`,
    body: { contentType, contentId },
  })
  if (error) throw error
}

// Toggle a student's lesson completion (teacher only).
export async function toggleLessonTrack(
  cid: number, lessonId: number, studentId: number,
  completed = true,
): Promise<ScheduleLessonDetail> {
  const { data, error } = await (client as any).put({
    url: `${base(cid, lessonId)}/tracks/${studentId}`,
    body: { completed },
  })
  if (error) throw error
  return (data as { data: ScheduleLessonDetail }).data
}
