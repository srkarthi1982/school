import { create } from 'zustand'
import type { StoreApi, UseBoundStore } from 'zustand'
import type { SortFilterParams } from '../components/CrudPage'
import { throwIfError } from './apiError'
import { DEFAULT_PAGINATION, buildQuery, extractPaged, type Pagination } from './storeHelpers'

export type CrudState<T> = {
  items: T[]
  pagination: Pagination
  fetchParams: SortFilterParams
  fetch:  (page?: number, params?: SortFilterParams) => Promise<void>
  create: (payload: Record<string, unknown>) => Promise<void>
  update: (id: number, payload: Record<string, unknown>) => Promise<void>
  remove: (id: number) => Promise<void>
}

type CrudConfig = {
  listApi:   (args: { query: any }) => Promise<{ data?: unknown }>
  createApi: (args: { body: any }) => Promise<{ error?: unknown }>
  updateApi: (args: { path: any; body: any }) => Promise<{ error?: unknown }>
  deleteApi: (args: { path: any }) => Promise<{ error?: unknown }>
  idPath:    (id: number) => Record<string, number>
}

export function createCrudStore<T>(config: CrudConfig): UseBoundStore<StoreApi<CrudState<T>>> {
  return create<CrudState<T>>((set, get) => ({
    items: [],
    pagination: { ...DEFAULT_PAGINATION },
    fetchParams: {},

    fetch: async (page = 1, params?) => {
      const effectiveParams = params !== undefined ? params : get().fetchParams
      if (params !== undefined) set({ fetchParams: params })
      const { data } = await config.listApi({ query: buildQuery(page, effectiveParams) })
      if (data) {
        const { items, pagination } = extractPaged<T>(data)
        set({ items, pagination })
      }
    },

    create: async (payload) => {
      const { error } = await config.createApi({ body: payload })
      throwIfError(error)
      get().fetch(get().pagination.page)
    },

    update: async (id, payload) => {
      const { error } = await config.updateApi({ path: config.idPath(id), body: payload })
      throwIfError(error)
      get().fetch(get().pagination.page)
    },

    remove: async (id) => {
      const { error } = await config.deleteApi({ path: config.idPath(id) })
      throwIfError(error)
      get().fetch(get().pagination.page)
    },
  }))
}
