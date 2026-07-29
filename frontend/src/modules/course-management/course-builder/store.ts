import {create} from 'zustand'
import '../../../api/client'
import {
  listCourseMastersApiV1CourseMastersGet as listMasters,
  getCourseMasterApiV1CourseMastersMasterIdGet as getMaster,
  createCourseMasterApiV1CourseMastersPost as createMaster,
  cloneCourseMasterApiV1CourseMastersClonePost as cloneMaster,
  updateCourseMasterApiV1CourseMastersMasterIdPut as updateMaster,
  deleteCourseMasterApiV1CourseMastersMasterIdDelete as deleteMaster,
} from '../../../api/generated'
import {extractErrorMessage} from '../../../infra/shared/utils/apiError'
import type {CourseMasterRecord} from '../_shared/types'

interface State {
  records: CourseMasterRecord[]
  current: CourseMasterRecord | null
  loading: boolean
  error: string | null

  fetchAll: () => Promise<void>
  fetchOne: (id: number) => Promise<void>
  create: (payload: {title: string; ctp_version: string; course_date: string | null}) => Promise<CourseMasterRecord | null>
  clone: (payload: {source_master_id: number; title: string; ctp_version: string; course_date: string | null}) => Promise<CourseMasterRecord | null>
  // Edit a master's basic settings (title / CTP version / course date).
  update: (id: number, payload: {title: string; ctp_version: string; course_date: string | null}) => Promise<CourseMasterRecord | null>
  // approve=true → status 'approved'; approve=false → back to 'draft'.
  setApproval: (record: CourseMasterRecord, approve: boolean) => Promise<void>
  remove: (id: number) => Promise<void>
  clearError: () => void
}

const useCourseBuilderStore = create<State>((set, get) => ({
  records: [],
  current: null,
  loading: false,
  error: null,

  fetchAll: async () => {
    set({loading: true, error: null})
    const {data, error} = await listMasters({})
    if (error) {
      set({error: extractErrorMessage(error), loading: false})
      return
    }
    const records: CourseMasterRecord[] = (data as any)?.data ?? []
    // Default ordering: Course Title, then CTP Version, both ascending and
    // case-insensitive.
    records.sort(
      (a, b) =>
        a.title.localeCompare(b.title, undefined, {sensitivity: 'base'}) ||
        (a.ctp_version ?? '').localeCompare(b.ctp_version ?? '', undefined, {sensitivity: 'base'}),
    )
    set({records, loading: false})
  },

  fetchOne: async (id) => {
    set({loading: true, error: null})
    const {data, error} = await getMaster({path: {master_id: id}})
    if (error) {
      set({error: extractErrorMessage(error), loading: false})
      return
    }
    set({current: (data as any)?.data ?? null, loading: false})
  },

  create: async (payload) => {
    set({loading: true, error: null})
    const {data, error} = await createMaster({body: payload as any})
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const record: CourseMasterRecord | null = (data as any)?.data ?? null
    await get().fetchAll()
    set({loading: false})
    return record
  },

  clone: async (payload) => {
    set({loading: true, error: null})
    const {data, error} = await cloneMaster({body: payload as any})
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const record: CourseMasterRecord | null = (data as any)?.data ?? null
    await get().fetchAll()
    set({loading: false})
    return record
  },

  update: async (id, payload) => {
    set({loading: true, error: null})
    const {data, error} = await updateMaster({path: {master_id: id}, body: payload as any})
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const record: CourseMasterRecord | null = (data as any)?.data ?? null
    await get().fetchAll()
    set({loading: false})
    return record
  },

  setApproval: async (record, approve) => {
    set({loading: true, error: null})
    // PUT requires title (CourseMasterUpdate); other unset fields are ignored.
    const {data, error} = await updateMaster({
      path: {master_id: record.id},
      body: {title: record.title, status: approve ? 'approved' : 'draft'} as any,
    })
    if (error) {
      const msg = extractErrorMessage(error)
      set({error: msg, loading: false})
      throw new Error(msg)
    }
    const updated: CourseMasterRecord | null = (data as any)?.data ?? null
    set((s) => ({
      loading: false,
      current: s.current?.id === record.id ? updated ?? s.current : s.current,
      records: s.records.map((r) => (r.id === record.id && updated ? updated : r)),
    }))
  },

  remove: async (id) => {
    set({loading: true, error: null})
    const {error} = await deleteMaster({path: {master_id: id}})
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

export default useCourseBuilderStore
