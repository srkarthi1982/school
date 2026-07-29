import '../../../../api/client'
import { create } from 'zustand'
import {
  adminListChunksApiV1RagAdminChunksGet as listChunksApi,
  adminGetChunkApiV1RagAdminChunksChunkIdGet as getChunkApi,
} from '../../../../api/generated'
import { throwIfError } from '../../../../infra/shared/utils/apiError'

export interface ChunkMeta {
  chunk_id: string
  source_type: string
  document_title: string
  page_no: number | null
  chunk_index: number
  content_chars: number
  content_preview: string
  indexed_at: string
  content_hash: string
  course_instance_id: number | null
  library_material_id: number | null
}

export interface ChunkDetail extends ChunkMeta {
  content: string
}

interface State {
  items: ChunkMeta[]
  total: number
  page: number
  pageSize: number
  sourceType: string
  q: string
  loading: boolean
  detail: ChunkDetail | null
  setFilter: (patch: Partial<Pick<State, 'sourceType' | 'q'>>) => void
  fetch: (page?: number) => Promise<void>
  openDetail: (id: string) => Promise<void>
  closeDetail: () => void
}

const useRagChunksStore = create<State>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  sourceType: '',
  q: '',
  loading: false,
  detail: null,
  setFilter: (patch) => set(patch),
  fetch: async (page = 1) => {
    set({ loading: true })
    try {
      const { sourceType, q, pageSize } = get()
      const query: Record<string, unknown> = { page, page_size: pageSize }
      if (sourceType) query.source_type = sourceType
      if (q) query.q = q
      const { data, error } = await listChunksApi({ query: query as any })
      throwIfError(error)
      const body = data as any
      set({ items: body?.data ?? [], total: body?.meta?.total ?? 0, page })
    } finally {
      set({ loading: false })
    }
  },
  openDetail: async (id) => {
    const { data, error } = await getChunkApi({ path: { chunk_id: id } })
    throwIfError(error)
    set({ detail: (data as any)?.data ?? null })
  },
  closeDetail: () => set({ detail: null }),
}))

export default useRagChunksStore
