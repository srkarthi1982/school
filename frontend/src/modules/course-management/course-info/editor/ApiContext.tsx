import { createContext, useContext, type ReactNode } from 'react'
import * as masterApi from '../api'
import type { ApiResponse } from '../api'

// The course-scoped slice of the Course Information api used by the editor and
// its course-scoped tabs (Lesson Creation, TP Link Preview). The combo-box
// dictionary calls (listResourceOptions/createResourceOption) are GLOBAL and
// stay imported directly — they are shared by the master and every instance.
//
// Default value = the Course Builder (master) api, so Course Builder renders
// the editor with zero behavioural change. Course Selection wraps the editor in
// a provider supplying the instance api (same signatures, different base path).
export interface CourseInfoApi {
  getCourseInfo: typeof masterApi.getCourseInfo
  updateCourseInfo: typeof masterApi.updateCourseInfo
  getGeneralInformation: typeof masterApi.getGeneralInformation
  upsertGeneralInformation: typeof masterApi.upsertGeneralInformation
  importGeneralInformation: typeof masterApi.importGeneralInformation
  getPersonnelRequirement: typeof masterApi.getPersonnelRequirement
  upsertPersonnelRequirement: typeof masterApi.upsertPersonnelRequirement
  getResources: typeof masterApi.getResources
  upsertResources: typeof masterApi.upsertResources
  importResources: typeof masterApi.importResources
  getLessonPlanning: typeof masterApi.getLessonPlanning
  upsertLessonPlanning: typeof masterApi.upsertLessonPlanning
  importLessonPlanning: typeof masterApi.importLessonPlanning
  getLessonCreation: typeof masterApi.getLessonCreation
  upsertLessonCreation: typeof masterApi.upsertLessonCreation
  importLessonCreation: typeof masterApi.importLessonCreation
  listLessonResourceOptions: typeof masterApi.listLessonResourceOptions
  getLessonAssociations: typeof masterApi.getLessonAssociations
  getTpLinkPreview: typeof masterApi.getTpLinkPreview
  // Course Selection only: ids of Lesson Creation lessons that have drifted from
  // the master. Absent on the Course Builder (master) api, so the shared editor
  // shows the per-lesson "Modified" badge only for instances.
  getLessonCreationModifiedLessons?: (
    id: number,
  ) => Promise<ApiResponse<{ modified_lesson_ids: number[] }>>
}

const defaultCourseInfoApi: CourseInfoApi = {
  getCourseInfo: masterApi.getCourseInfo,
  updateCourseInfo: masterApi.updateCourseInfo,
  getGeneralInformation: masterApi.getGeneralInformation,
  upsertGeneralInformation: masterApi.upsertGeneralInformation,
  importGeneralInformation: masterApi.importGeneralInformation,
  getPersonnelRequirement: masterApi.getPersonnelRequirement,
  upsertPersonnelRequirement: masterApi.upsertPersonnelRequirement,
  getResources: masterApi.getResources,
  upsertResources: masterApi.upsertResources,
  importResources: masterApi.importResources,
  getLessonPlanning: masterApi.getLessonPlanning,
  upsertLessonPlanning: masterApi.upsertLessonPlanning,
  importLessonPlanning: masterApi.importLessonPlanning,
  getLessonCreation: masterApi.getLessonCreation,
  upsertLessonCreation: masterApi.upsertLessonCreation,
  importLessonCreation: masterApi.importLessonCreation,
  listLessonResourceOptions: masterApi.listLessonResourceOptions,
  getLessonAssociations: masterApi.getLessonAssociations,
  getTpLinkPreview: masterApi.getTpLinkPreview,
}

const CourseInfoApiContext = createContext<CourseInfoApi>(defaultCourseInfoApi)

export function CourseInfoApiProvider({
  value,
  children,
}: {
  value: CourseInfoApi
  children: ReactNode
}) {
  return <CourseInfoApiContext.Provider value={value}>{children}</CourseInfoApiContext.Provider>
}

export function useCourseInfoApi(): CourseInfoApi {
  return useContext(CourseInfoApiContext)
}
