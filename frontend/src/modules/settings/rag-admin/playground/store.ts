import '../../../../api/client'
import { create } from 'zustand'
import { adminSearchDebugApiV1RagAdminSearchDebugPost as searchDebugApi } from '../../../../api/generated'
import { throwIfError } from '../../../../infra/shared/utils/apiError'

export interface DebugHit {
  chunk_id: string
  source_type: string
  document_title: string
  page_no: number | null
  content: string
  cosine: number | null
  dense_rank: number | null
  kw_rank: number | null
  rrf_score: number | null
  course_instance_id: number | null
  library_material_id: number | null
}

interface State {
  query: string
  topK: number
  hybrid: boolean
  scope: 'mine' | 'all'
  hits: DebugHit[]
  loading: boolean
  ran: boolean
  patch: (p: Partial<Pick<State, 'query' | 'topK' | 'hybrid' | 'scope'>>) => void
  run: () => Promise<void>
}

const useRagPlaygroundStore = create<State>((set, get) => ({
  query: '',
  topK: 8,
  hybrid: true,
  scope: 'mine',
  hits: [],
  loading: false,
  ran: false,
  patch: (p) => set(p),
  run: async () => {
    const { query, topK, hybrid, scope } = get()
    if (!query.trim()) return
    set({ loading: true })
    try {
      const { data, error } = await searchDebugApi({
        body: { query, top_k: topK, hybrid, scope } as any,
      })
      throwIfError(error)
      set({ hits: (data as any)?.data?.hits ?? [], ran: true })
    } finally {
      set({ loading: false })
    }
  },
}))

export default useRagPlaygroundStore
