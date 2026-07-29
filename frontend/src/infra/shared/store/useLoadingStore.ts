import { create } from 'zustand'

/**
 * Global in-flight HTTP request counter.
 *
 * The API client (`src/api/client.ts`) increments on every non-silent request
 * and decrements when it settles (response OR network error). The TopLoadingBar
 * subscribes to `inflight > 0` to show a subtle progress line while anything is
 * loading. Driven imperatively from the interceptors via `getState()`.
 */
interface LoadingState {
  inflight: number
  start: () => void
  done: () => void
  reset: () => void
}

const useLoadingStore = create<LoadingState>((set, get) => ({
  inflight: 0,
  start: () => set({ inflight: get().inflight + 1 }),
  // Guard so a stray decrement can never drive the counter negative (which
  // would keep the bar stuck "loading" forever).
  done: () => set({ inflight: Math.max(0, get().inflight - 1) }),
  reset: () => set({ inflight: 0 }),
}))

export const selectIsLoading = (s: LoadingState) => s.inflight > 0

export default useLoadingStore
