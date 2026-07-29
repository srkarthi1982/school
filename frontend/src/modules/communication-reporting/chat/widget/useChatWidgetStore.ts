import { create } from 'zustand'
import useChatStore from '../chat-store'

/**
 * App-level open/close state for the floating chat widget. Lives outside the
 * widget component so a toast (or anything else) can pop the widget open on a
 * specific conversation from anywhere in the app.
 */
interface ChatWidgetState {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  openConversation: (conversationId: string) => void
}

const useChatWidgetStore = create<ChatWidgetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  openConversation: (conversationId) => {
    useChatStore.getState().setActiveConversation(conversationId)
    set({ isOpen: true })
  },
}))

export const selectWidgetOpen = (s: ChatWidgetState) => s.isOpen

export default useChatWidgetStore
