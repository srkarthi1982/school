import { createPortal } from 'react-dom'
import useToastStore, { selectToasts, selectToastRemove } from '../store/useToastStore'
import Toast from './NotificationToast'

export default function ToastContainer() {
  const toasts = useToastStore(selectToasts)
  const remove = useToastStore(selectToastRemove)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="pointer-events-none fixed top-4 right-4 z-[1000] flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onClose={() => remove(t.id)} />
      ))}
    </div>,
    document.body,
  )
}
