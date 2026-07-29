import { create } from 'zustand'

// Holds the trimmed traceback returned by the backend's unhandled-error handler
// (DEBUG mode) for the most recent 5xx response. The API client populates it; the
// shared error banner reads it — matched by the request id embedded in the message
// — to offer a "Show details" expander without threading details through stores.
interface LastServerError {
  requestId: string
  details: string[]
}

interface State {
  last: LastServerError | null
  setLast: (entry: LastServerError | null) => void
}

export const useServerErrorStore = create<State>((set) => ({
  last: null,
  setLast: (entry) => set({ last: entry }),
}))
