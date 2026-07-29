import { create } from 'zustand'

/**
 * Full-bleed content mode. When a route wants its content to fill the entire
 * Library/module content area edge-to-edge (e.g. the in-app document reader),
 * it flips this flag and Layout drops its standard content padding/frame while
 * keeping the sidebar + submenu visible.
 */
interface FullBleedState {
  fullBleed: boolean
  setFullBleed: (v: boolean) => void
}

const useFullBleedStore = create<FullBleedState>((set) => ({
  fullBleed: false,
  setFullBleed: (fullBleed) => set({ fullBleed }),
}))

export default useFullBleedStore
