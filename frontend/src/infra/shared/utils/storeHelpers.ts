import type { SortFilterParams } from '../components/CrudPage'

export interface Pagination {
  total: number
  page: number
  page_size: number
  pages: number
}

export const DEFAULT_PAGINATION: Pagination = { total: 0, page: 1, page_size: 20, pages: 1 }

export function extractPaged<T>(data: unknown): { items: T[]; pagination: Pagination } {
  const d = data as any
  if (d?.success && d.meta) {
    return {
      items: d.data ?? [],
      pagination: { total: d.meta.total, page: d.meta.page, page_size: d.meta.page_size, pages: d.meta.pages },
    }
  }
  return { items: d?.data ?? d ?? [], pagination: DEFAULT_PAGINATION }
}

export function buildQuery(page: number, params: SortFilterParams): Record<string, unknown> {
  const q: Record<string, unknown> = { page, page_size: 20 }
  if (params.sortBy) {
    q.sort_by = params.sortBy
    q.sort_order = params.sortOrder ?? 'asc'
  }
  if (params.filters) Object.assign(q, params.filters)
  return q
}
