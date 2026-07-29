import useConfirmStore from '../store/useConfirmStore'
import ConfirmDialog from './ConfirmDialog'

/**
 * Single app-level mount that renders the active confirmDialog() request.
 * Lives once in Layout so any code can call confirmDialog() imperatively.
 */
export default function ConfirmHost() {
  const current = useConfirmStore((s) => s.current)
  const resolve = useConfirmStore((s) => s.resolve)

  return (
    <ConfirmDialog
      open={current != null}
      title={current?.title ?? ''}
      message={current?.message}
      confirmLabel={current?.confirmLabel}
      cancelLabel={current?.cancelLabel}
      tone={current?.tone}
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  )
}
