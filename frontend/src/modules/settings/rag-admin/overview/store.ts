import '../../../../api/client'
import { create } from 'zustand'
import { adminStatsApiV1RagAdminStatsGet as fetchStatsApi } from '../../../../api/generated'
import { throwIfError } from '../../../../infra/shared/utils/apiError'

export interface IngestionError {
  source_type: string
  source_id: string
  attempts: number
  error?: string | null
}

export interface RagStats {
  total_chunks: number
  chunks_by_source: Record<string, number>
  documents: Record<string, number>
  ingestion_by_status: Record<string, number>
  errors: IngestionError[]
}

interface State {
  stats: RagStats | null
  loading: boolean
  fetch: () => Promise<void>
}

const useRagOverviewStore = create<State>((set) => ({
  stats: null,
  loading: false,
  fetch: async () => {
    set({ loading: true })
    try {
      const { data, error } = await fetchStatsApi()
      throwIfError(error)
      set({ stats: (data as any)?.data ?? null })
    } finally {
      set({ loading: false })
    }
  },
}))

export default useRagOverviewStore
