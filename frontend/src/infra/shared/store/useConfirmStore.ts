import { create } from 'zustand'
import type { ReactNode } from 'react'

export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

interface ConfirmRequest extends ConfirmOptions {
  id: number
  resolve: (ok: boolean) => void
}

interface ConfirmState {
  current: ConfirmRequest | null
  open: (opts: ConfirmOptions) => Promise<boolean>
  resolve: (ok: boolean) => void
}

let _id = 0

const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  open: (opts) =>
    new Promise<boolean>((resolve) => {
      // If one is already open, dismiss it as cancelled before showing the next.
      const cur = get().current
      if (cur) cur.resolve(false)
      set({ current: { ...opts, id: ++_id, resolve } })
    }),
  resolve: (ok) => {
    const cur = get().current
    if (cur) cur.resolve(ok)
    set({ current: null })
  },
}))

export default useConfirmStore

/**
 * Imperative, promise-based confirmation — a styled replacement for
 * window.confirm. Resolves true on confirm, false on cancel/dismiss.
 *
 *   if (!(await confirmDialog({ title: 'Delete item?' }))) return
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open(opts)
}
