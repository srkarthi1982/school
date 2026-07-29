import { silent } from '../../../../api/client'
import { create } from 'zustand'
import {
  ingestRunApiV1RagAdminIngestRunPost as runIngestApi,
  ingestProgressApiV1RagAdminIngestProgressGet as progressApi,
} from '../../../../api/generated'
import { throwIfError } from '../../../../infra/shared/utils/apiError'

export interface IngestionError {
  source_type: string
  source_id: string
  attempts: number
  error: string | null
}

export interface IngestionProgress {
  total: number
  indexed: number
  pending: number
  indexing: number
  error: number
  orphan_bindings: number
  in_flight: number
  running: boolean
  last_indexed_at: string | null
  errors: IngestionError[]
}

export interface StartResult {
  status: 'scheduled' | 'disabled'
  reason: string | null
}

interface State {
  progress: IngestionProgress | null
  starting: boolean
  fetchProgress: () => Promise<void>
  start: () => Promise<StartResult>
}

const useRagIngestionStore = create<State>((set, get) => ({
  progress: null,
  starting: false,
  // Polled every couple seconds — mark silent so the global top loading bar
  // doesn't flicker.
  fetchProgress: async () => {
    const { data, error } = await progressApi({ ...silent() })
    throwIfError(error)
    set({ progress: (data as any)?.data ?? null })
  },
  // Returns the outcome so the page can say what happened. The API answers 200 even
  // when it schedules nothing (RAG off, or this worker isn't the ingestion leader),
  // so the body — not the status code — is what tells us the click actually landed.
  start: async () => {
    set({ starting: true })
    try {
      const { data, error } = await runIngestApi()
      throwIfError(error)
      const result = (data as any)?.data as StartResult | undefined
      await get().fetchProgress()
      return result ?? { status: 'disabled', reason: null }
    } finally {
      set({ starting: false })
    }
  },
}))

export default useRagIngestionStore
