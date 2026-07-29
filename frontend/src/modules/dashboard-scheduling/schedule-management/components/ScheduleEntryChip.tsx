import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { HiOutlineTrash } from 'react-icons/hi2'
import type { Course, ScheduleEntry } from '../types'
import { importancePalette } from './ImportanceBadge'
import { formatTime } from '../utils/timeUtils'
import useScheduleManagementStore, { selectSavingEntryId } from '../store'
import { confirmDialog } from '../../../../infra/shared/store/useConfirmStore'

interface Props {
  entry: ScheduleEntry
  course?: Course
  canEdit: boolean
  onClick: () => void
  dragId: string
  originDayKey: string
}

export default function ScheduleEntryChip({ entry, course, canEdit, onClick, dragId, originDayKey }: Props) {
  // While any move is being persisted the whole calendar locks (see store).
  const savingEntryId = useScheduleManagementStore(selectSavingEntryId)
  const anySaving = savingEntryId !== null
  const isSaving = savingEntryId === entry.id

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: { entryId: entry.id, type: 'entry', originDayKey },
    disabled: !canEdit || anySaving,
  })
  const removeCoursePlacement = useScheduleManagementStore(s => s.removeCoursePlacement)
  const canDelete = canEdit && entry.placementId != null && !anySaving
  const onDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const okToDelete = await confirmDialog({
      title: 'Delete this lesson?',
      message: `Remove "${entry.title}" from the schedule?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })
    if (okToDelete) removeCoursePlacement(entry)
  }

  const palette = importancePalette(entry.importance)
  const start   = new Date(entry.startAt)
  const summary = course ? `${course.code} · ${entry.title}` : entry.title

  const style: React.CSSProperties = {
    background: palette.bg,
    color: palette.text,
    borderInlineStart: `3px solid ${palette.stripe}`,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : (anySaving && !isSaving ? 0.55 : 1),
    cursor: isSaving
      ? 'wait'
      : anySaving
        ? 'not-allowed'
        : canEdit ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
    touchAction: canEdit ? 'none' : 'auto',
    zIndex: isDragging || isSaving ? 50 : 1,
    boxShadow: isSaving ? '0 0 0 2px var(--accent)' : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return
        if ((e.target as HTMLElement).closest?.('[data-delete-btn]')) return
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="group rounded-[5px] px-1.5 py-[2px] flex items-center gap-1 text-[10.5px] font-semibold truncate hover:shadow-sm transition-shadow select-none"
      style={style}
      title={`${course ? course.code + ' — ' : ''}${entry.title} — ${formatTime(start)}`}
    >
      <span className="tabular-nums opacity-75">{formatTime(start)}</span>
      <span className="truncate font-bold">{summary}</span>
      {isSaving && (
        <span
          className="ms-auto shrink-0 w-2.5 h-2.5 rounded-full animate-spin"
          style={{ border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.7 }}
          aria-hidden
        />
      )}
      {canDelete && !isSaving && (
        <button
          type="button"
          data-delete-btn
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          className="ms-auto shrink-0 text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ cursor: 'pointer' }}
          aria-label="Delete lesson"
          title="Delete lesson"
        >
          <HiOutlineTrash className="text-[11px]" />
        </button>
      )}
    </div>
  )
}
