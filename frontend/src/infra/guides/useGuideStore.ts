import { create } from 'zustand'

import { canAccess } from '../shared/utils/menuUtils'
import useAuthStore from '../auth/useAuthStore'
import useToastStore from '../shared/store/useToastStore'
import { GUIDES } from './registry'
import type { GuideDefinition } from './registry'

export interface GuideStoreState {
  activeId: string | null
  stepIndex: number
  /** Begin a guide by id. Validates existence + permissions; no-op + toast otherwise. */
  start: (id: string) => void
  /** Advance to the next step; stops the tour if there are no more steps. */
  next: () => void
  /** Stop the tour (user dismissal or external cleanup). */
  stop: () => void
}

const useGuideStore = create<GuideStoreState>((set, get) => ({
  activeId: null,
  stepIndex: 0,

  start: (id: string) => {
    const def: GuideDefinition | undefined = GUIDES[id]
    if (!def) {
      useToastStore.getState().push({
        variant: 'warning',
        title: "This guide isn't available.",
      })
      return
    }
    const perms = useAuthStore.getState().permissions
    if (def.permissions && def.permissions.length > 0) {
      if (!canAccess({ permissions: def.permissions }, perms)) {
        useToastStore.getState().push({
          variant: 'warning',
          title: "This guide isn't available.",
        })
        return
      }
    }
    if (get().activeId) get().stop()
    set({ activeId: id, stepIndex: 0 })
  },

  next: () => {
    const { activeId, stepIndex } = get()
    if (!activeId) return
    const def = GUIDES[activeId]
    if (!def) {
      set({ activeId: null, stepIndex: 0 })
      return
    }
    if (stepIndex + 1 >= def.steps.length) {
      set({ activeId: null, stepIndex: 0 })
      return
    }
    set({ stepIndex: stepIndex + 1 })
  },

  stop: () => set({ activeId: null, stepIndex: 0 }),
}))

export default useGuideStore