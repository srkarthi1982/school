import { create } from 'zustand'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  variant: ToastVariant
  title?: string
  body?: string
  duration: number
  onClick?: () => void
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string
  remove: (id: string) => void
  clear: () => void
}

const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (input) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const toast: Toast = {
      id,
      variant: input.variant ?? 'info',
      title: input.title,
      body: input.body,
      duration: input.duration ?? 5000,
      onClick: input.onClick,
    }
    set({ toasts: [...get().toasts, toast] })
    if (toast.duration > 0) {
      window.setTimeout(() => get().remove(id), toast.duration)
    }
    return id
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  clear: () => set({ toasts: [] }),
}))

export const selectToasts = (s: ToastState) => s.toasts
export const selectToastPush = (s: ToastState) => s.push
export const selectToastRemove = (s: ToastState) => s.remove

export function useToast() {
  const push = useToastStore(selectToastPush)
  return {
    info: (msg: Omit<Toast, 'id' | 'duration' | 'variant'> & { duration?: number }) =>
      push({ ...msg, variant: 'info' }),
    success: (msg: Omit<Toast, 'id' | 'duration' | 'variant'> & { duration?: number }) =>
      push({ ...msg, variant: 'success' }),
    warning: (msg: Omit<Toast, 'id' | 'duration' | 'variant'> & { duration?: number }) =>
      push({ ...msg, variant: 'warning' }),
    error: (msg: Omit<Toast, 'id' | 'duration' | 'variant'> & { duration?: number }) =>
      push({ ...msg, variant: 'error' }),
  }
}

export default useToastStore
