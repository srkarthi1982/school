import '../../../api/client'
import { create } from 'zustand'
import type { SortFilterParams } from '../../../infra/shared/components/CrudPage'
import { throwIfError } from '../../../infra/shared/utils/apiError'
import {
  DEFAULT_PAGINATION,
  buildQuery,
  extractPaged,
  type Pagination,
} from '../../../infra/shared/utils/storeHelpers'
import {
  createClassSessionApi,
  deleteClassSessionApi,
  endClassSessionApi,
  getClassSession,
  joinClassSessionApi,
  listClassSessions,
  startClassSessionApi,
  updateClassSessionApi,
} from './api'
import type {
  ClassSession,
  CreateSessionPayload,
  JoinToken,
  UpdateSessionPayload,
} from './types'

type State = {
  items: ClassSession[]
  pagination: Pagination
  fetchParams: SortFilterParams
  current: ClassSession | null
  loading: boolean
  error: string | null

  fetch: (page?: number, params?: SortFilterParams) => Promise<void>
  fetchOne: (id: number) => Promise<void>
  create: (payload: CreateSessionPayload) => Promise<ClassSession>
  update: (id: number, payload: UpdateSessionPayload) => Promise<void>
  remove: (id: number) => Promise<void>
  start: (id: number) => Promise<void>
  end: (id: number) => Promise<void>
  join: (id: number) => Promise<JoinToken>
  clearError: () => void
}

const useVirtualClassroomStore = create<State>((set, get) => ({
  items: [],
  pagination: { ...DEFAULT_PAGINATION },
  fetchParams: {},
  current: null,
  loading: false,
  error: null,

  fetch: async (page = 1, params) => {
    set({ loading: true, error: null })
    const effective = params !== undefined ? params : get().fetchParams
    if (params !== undefined) set({ fetchParams: params })
    try {
      const { data, error } = await listClassSessions({ query: buildQuery(page, effective) })
      throwIfError(error)
      if (data) {
        const { items, pagination } = extractPaged<ClassSession>(data)
        set({ items, pagination })
      }
    } catch (e: unknown) {
      set({ error: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  fetchOne: async (id) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await getClassSession({ path: { session_id: id } })
      throwIfError(error)
      const payload = (data as { data?: ClassSession })?.data ?? null
      set({ current: payload })
    } catch (e: unknown) {
      set({ error: (e as Error).message, current: null })
    } finally {
      set({ loading: false })
    }
  },

  create: async (payload) => {
    const { data, error } = await createClassSessionApi({ body: payload })
    throwIfError(error)
    await get().fetch(get().pagination.page)
    return (data as { data: ClassSession }).data
  },

  update: async (id, payload) => {
    const { error } = await updateClassSessionApi({
      path: { session_id: id },
      body: payload,
    })
    throwIfError(error)
    await get().fetch(get().pagination.page)
    if (get().current?.id === id) await get().fetchOne(id)
  },

  remove: async (id) => {
    const { error } = await deleteClassSessionApi({ path: { session_id: id } })
    throwIfError(error)
    await get().fetch(get().pagination.page)
    if (get().current?.id === id) set({ current: null })
  },

  start: async (id) => {
    const { error } = await startClassSessionApi({ path: { session_id: id } })
    throwIfError(error)
    await get().fetch(get().pagination.page)
    if (get().current?.id === id) await get().fetchOne(id)
  },

  end: async (id) => {
    const { error } = await endClassSessionApi({ path: { session_id: id } })
    throwIfError(error)
    await get().fetch(get().pagination.page)
    if (get().current?.id === id) await get().fetchOne(id)
  },

  join: async (id) => {
    const { data, error } = await joinClassSessionApi({ path: { session_id: id } })
    throwIfError(error)
    return (data as { data: JoinToken }).data
  },

  clearError: () => set({ error: null }),
}))

export default useVirtualClassroomStore
