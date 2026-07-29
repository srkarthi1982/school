import { client } from '../../../api/client'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

// ─── Personnel (Course Selection → Personnel category) ──────────────────────

export interface PersonnelMember {
  profile_id: number
  full_name: string
  username: string | null
  rank: string | null
  email: string | null
  // Course role; only populated for "Other Selection" members added before
  // the role picker was dropped.
  role: string | null
  // The user's current system roles.
  roles: string[]
}

export interface CoursePersonnel {
  students: PersonnelMember[]
  instructors: PersonnelMember[]
  others: PersonnelMember[]
}

export interface PersonnelCandidate {
  profile_id: number
  full_name: string
  username: string | null
  rank: string | null
  email: string | null
  roles: string[]
  // Set when this student is already enrolled in another non-closed course, so
  // the picker can block re-selection (one student → one active course at a time).
  active_course_id: number | null
  active_course_title: string | null
}

export type PersonnelKind = 'student' | 'instructor' | 'other'

export async function getCoursePersonnel(
  courseId: number,
): Promise<ApiResponse<CoursePersonnel>> {
  const res = await (client as any).get({
    url: `/api/v1/courses/${courseId}/personnel`,
  })
  return res.data ?? { success: false }
}

export async function listPersonnelCandidates(
  kind: PersonnelKind,
  search?: string,
  courseId?: number,
): Promise<ApiResponse<PersonnelCandidate[]>> {
  const res = await (client as any).get({
    url: '/api/v1/courses/personnel/candidates',
    query: {
      kind,
      ...(search ? { search } : {}),
      ...(courseId != null ? { course_id: courseId } : {}),
    },
  })
  return res.data ?? { success: false }
}

export async function addCourseStudent(
  courseId: number,
  profileId: number,
): Promise<ApiResponse<CoursePersonnel>> {
  const res = await (client as any).post({
    url: `/api/v1/courses/${courseId}/personnel/students`,
    body: { profile_id: profileId },
  })
  // On a 4xx the parsed body (incl. the warning message) is in res.error.
  return res.data ?? res.error ?? { success: false }
}

export async function removeCourseStudent(courseId: number, profileId: number): Promise<void> {
  await (client as any).delete({
    url: `/api/v1/courses/${courseId}/personnel/students/${profileId}`,
  })
}

export async function addCourseInstructor(
  courseId: number,
  profileId: number,
): Promise<ApiResponse<CoursePersonnel>> {
  const res = await (client as any).post({
    url: `/api/v1/courses/${courseId}/personnel/instructors`,
    body: { profile_id: profileId },
  })
  return res.data ?? res.error ?? { success: false }
}

export async function removeCourseInstructor(courseId: number, profileId: number): Promise<void> {
  await (client as any).delete({
    url: `/api/v1/courses/${courseId}/personnel/instructors/${profileId}`,
  })
}

export async function addCourseOther(
  courseId: number,
  profileId: number,
): Promise<ApiResponse<CoursePersonnel>> {
  const res = await (client as any).post({
    url: `/api/v1/courses/${courseId}/personnel/others`,
    body: { profile_id: profileId },
  })
  return res.data ?? res.error ?? { success: false }
}

export async function removeCourseOther(courseId: number, profileId: number): Promise<void> {
  await (client as any).delete({
    url: `/api/v1/courses/${courseId}/personnel/others/${profileId}`,
  })
}
