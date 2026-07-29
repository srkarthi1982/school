// Registers the auth/refresh interceptors before any request fires.
import '../../../api/client'

import { create } from 'zustand'

import {
  createFaqApiV1FaqPost as createFaq,
  deleteFaqApiV1FaqFaqIdDelete as deleteFaq,
  listFaqsApiV1FaqGet as listFaqs,
  updateFaqApiV1FaqFaqIdPut as updateFaq,
} from '../../../api/generated'
import { throwIfError } from '../../../infra/shared/utils/apiError'
import type { FaqEntry, FaqInput } from './faq-types'

export type FaqState = {
  items: FaqEntry[]
  loading: boolean
  search: string
  setSearch: (q: string) => void
  fetch: () => Promise<void>
  add: (input: FaqInput) => Promise<void>
  update: (id: number, patch: FaqInput) => Promise<void>
  remove: (id: number) => Promise<void>
}

const useFaqStore = create<FaqState>((set, get) => ({
  items: [],
  loading: false,
  search: '',

  setSearch: (q) => set({ search: q }),

  fetch: async () => {
    set({ loading: true })
    try {
      const { data, error } = await listFaqs()
      throwIfError(error)
      set({ items: data?.data ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  add: async (input) => {
    const { error } = await createFaq({
      body: { question: input.question.trim(), answer: input.answer.trim() },
    })
    throwIfError(error)
    await get().fetch()
  },

  update: async (id, patch) => {
    const { error } = await updateFaq({
      path: { faq_id: id },
      body: { question: patch.question.trim(), answer: patch.answer.trim() },
    })
    throwIfError(error)
    await get().fetch()
  },

  remove: async (id) => {
    const { error } = await deleteFaq({ path: { faq_id: id } })
    throwIfError(error)
    await get().fetch()
  },
}))

export const selectFaqItems = (s: FaqState) => s.items

export default useFaqStore
