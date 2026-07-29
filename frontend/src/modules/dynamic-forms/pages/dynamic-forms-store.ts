import { create } from 'zustand'
import '../../../api/client'

interface FormSummary {
  id: number
  title: string
}

interface DynamicFormsState {
  forms: FormSummary[]
  loading: boolean
  fetch: () => Promise<void>
}

const useDynamicFormsStore = create<DynamicFormsState>((set) => ({
  forms: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const response = await fetch('/api/v1/admin/dynamic-forms/summary')
      if (!response.ok) throw new Error('Failed to fetch forms')
      const data: FormSummary[] = (await response.json()).data
      set({ forms: data })
    } catch {
      set({ forms: [] })
    } finally {
      set({ loading: false })
    }
  },
}))

export default useDynamicFormsStore
