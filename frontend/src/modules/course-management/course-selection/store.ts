import {create} from 'zustand'
import {client} from '../../../api/client'
import {
  listCoursesApiV1CoursesGet as listCourses,
  getCourseApiV1CoursesCourseIdGet as getCourse,
  createCourseApiV1CoursesPost as createCourse,
  updateCourseApiV1CoursesCourseIdPut as updateCourse,
  deleteCourseApiV1CoursesCourseIdDelete as deleteCourse,
  listCourseMastersApiV1CourseMastersGet as listMasters,
} from '../../../api/generated'
import {extractErrorMessage} from '../../../infra/shared/utils/apiError'
import {confirmDialog} from '../../../infra/shared/store/useConfirmStore'
import type {CourseMasterRecord, CourseRecord} from '../_shared/types'

export interface CourseInstancePayload {
  title: string
  master_id?: number
  start_date: string
  end_date: string
  course_date?: string | null
  status?: string
}

interface State {
  records: CourseRecord[]
  current: CourseRecord | null
  // Masters available as the "based on" source for a new instance.
  masters: CourseMasterRecord[]
  loading: boolean
  error: string | null

  fetchAll: () => Promise<void>
  fetchOne: (id: number) => Promise<void>
  fetchMasters: () => Promise<void>
  create: (payload: CourseInstancePayload) => Promise<CourseRecord | null>
  update: (id: number, payload: Record<string, unknown>) => Promise<CourseRecord | null>
  // approve=true → status 'approved'; approve=false → back to 'draft'.
  setApproval: (record: CourseRecord, approve: boolean) => Promise<void>
  // Push an approved course's end date out by `additionalDays` (cumulative
  // extensions are capped server-side at 20% of the original period).
  extendPeriod: (id: number, additionalDays: number) => Promise<void>
  // Temporarily stop an approved course (all activities go on hold) / resume a
  // stopped one (pending sessions + end date shift forward by the stop gap).
  stopCourse: (id: number) => Promise<void>
  resumeCourse: (id: number) => Promise<void>
  remove: (id: number) => Promise<void>
  clearError: () => void
}

const useCourseSelectionStore = create<State>((set, get) => ({
  records: [],
  current: null,
  masters: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({loading: true, error: null})
    const {data, error} = await listCourses({})
    if (error) {
      set({error: extractErrorMessage(error), loading: false})
      return
    }
    set({records: (data as any)?.data ?? [], loading: false})
  },

  fetchOne: async (id) => {
    set({loading: true, error: null})
    const {data, error} = await getCourse({path: {course_id: id}})
    if (error) {
      set({error: extractErrorMessage(error), loading: false})
      return
    }
    set({current: (data as any)?.data ?? null, loading: false})
  },

  fetchMasters: async () => {
    // Fetch every master so the create modal can show non-approved ones greyed
    // out (only approved masters are actually selectable — see CourseInstanceModal).
    const {data, error} = await listMasters({query: {page_size: 200} as any})
    if (error) {
      set({error: extractErrorMessage(error)})
      return
    }
    set({masters: (data as any)?.data ?? []})
  },

  create: async (payload) => {
    set({loading: true, error: null})
    const {data, error} = await createCourse({body: payload as any})
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const record: CourseRecord | null = (data as any)?.data ?? null
    await get().fetchAll()
    set({loading: false})
    return record
  },

  update: async (id, payload) => {
    set({loading: true, error: null})
    const {data, error} = await updateCourse({path: {course_id: id}, body: payload as any})
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const record: CourseRecord | null = (data as any)?.data ?? null
    // Keep both the list and the open detail in sync with the server copy.
    set((s) => ({
      loading: false,
      current: s.current?.id === id ? record ?? s.current : s.current,
      records: s.records.map((r) => (r.id === id && record ? record : r)),
    }))
    return record
  },

  setApproval: async (record, approve) => {
    // Re-approving a course whose operational (session) schedule a user already
    // modified must not silently clobber those edits: ask the approver to keep
    // them or reset from the template. First approval (no session yet) just
    // copies in the backend, so there's nothing to prompt about.
    let resetFromTemplate = false
    if (approve) {
      try {
        const {data: meta} = await (client as any).get({
          url: `/api/v1/course-session-schedules/${record.id}/meta`,
        })
        const m = (meta as {data?: any} | undefined)?.data
        if (m?.exists && m?.touched) {
          const who = m.lastModifiedByName ? ` by ${m.lastModifiedByName}` : ''
          const when = m.lastModifiedAt
            ? ` on ${new Date(m.lastModifiedAt).toLocaleDateString()}`
            : ''
          resetFromTemplate = await confirmDialog({
            title: 'Schedule already modified',
            message: `This course's session schedule was modified${who}${when}. Keep those changes, or reset the schedule from the template?`,
            confirmLabel: 'Reset from template',
            cancelLabel: 'Keep as is',
            tone: 'danger',
          })
        }
      } catch {
        // Meta is best-effort; fall through to a plain approval if it fails.
      }
    }

    set({loading: true, error: null})
    // PUT requires title (CourseUpdate); other unset fields are ignored.
    const {data, error} = await updateCourse({
      path: {course_id: record.id},
      body: {title: record.title, status: approve ? 'approved' : 'draft'} as any,
    })
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    // Approver chose to discard operational edits → force re-copy from template.
    if (approve && resetFromTemplate) {
      try {
        await (client as any).post({
          url: `/api/v1/course-session-schedules/${record.id}/reset`,
        })
      } catch {
        // Non-fatal: the course is approved; reset can be retried from the editor.
      }
    }
    const updated: CourseRecord | null = (data as any)?.data ?? null
    set((s) => ({
      loading: false,
      current: s.current?.id === record.id ? updated ?? s.current : s.current,
      records: s.records.map((r) => (r.id === record.id && updated ? updated : r)),
    }))
  },

  extendPeriod: async (id, additionalDays) => {
    set({loading: true, error: null})
    // Raw client call: the generated SDK doesn't include /extend until
    // `npm run generate-api` runs against a backend with the new route.
    const {data, error} = await (client as any).post({
      url: `/api/v1/courses/${id}/extend`,
      body: {additional_days: additionalDays},
    })
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const updated: CourseRecord | null = (data as any)?.data ?? null
    set((s) => ({
      loading: false,
      current: s.current?.id === id ? updated ?? s.current : s.current,
      records: s.records.map((r) => (r.id === id && updated ? updated : r)),
    }))
  },

  stopCourse: async (id) => {
    set({loading: true, error: null})
    // Raw client call: the generated SDK doesn't include /stop until
    // `npm run generate-api` runs against a backend with the new route.
    const {data, error} = await (client as any).post({
      url: `/api/v1/courses/${id}/stop`,
    })
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const updated: CourseRecord | null = (data as any)?.data ?? null
    set((s) => ({
      loading: false,
      current: s.current?.id === id ? updated ?? s.current : s.current,
      records: s.records.map((r) => (r.id === id && updated ? updated : r)),
    }))
  },

  resumeCourse: async (id) => {
    set({loading: true, error: null})
    // Raw client call: see stopCourse.
    const {data, error} = await (client as any).post({
      url: `/api/v1/courses/${id}/resume`,
    })
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const updated: CourseRecord | null = (data as any)?.data ?? null
    set((s) => ({
      loading: false,
      current: s.current?.id === id ? updated ?? s.current : s.current,
      records: s.records.map((r) => (r.id === id && updated ? updated : r)),
    }))
  },

  remove: async (id) => {
    set({loading: true, error: null})
    const {error} = await deleteCourse({path: {course_id: id}})
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    await get().fetchAll()
    set({loading: false})
  },

  clearError: () => set({error: null}),
}))

export default useCourseSelectionStore
