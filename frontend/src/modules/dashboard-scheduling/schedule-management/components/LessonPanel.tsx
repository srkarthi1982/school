import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { HiOutlineXMark, HiOutlineBars2 } from 'react-icons/hi2'
import { useI18n } from '../../../../infra/locales/I18nContext'
import useScheduleManagementStore, { selectCourseSchedule } from '../store'

// One draggable lesson tile. Dragging it onto the calendar (handled in the page's
// onDragEnd via data.type === 'lesson') places the lesson at the dropped day/time.
function LessonTile({
  lesson,
  placed,
}: {
  lesson: {
    id: number
    lessonNumber?: string | null
    lessonTitle?: string | null
    periodPerUnit?: number | null
    environmentLabel?: string | null
    periodTypeLabel?: string | null
  }
  placed: number
}) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lesson-${lesson.id}`,
    // title/number ride along so the drag overlay can render without a lookup.
    data: {
      type: 'lesson',
      lessonId: lesson.id,
      periodPerUnit: lesson.periodPerUnit,
      lessonTitle: lesson.lessonTitle,
      lessonNumber: lesson.lessonNumber,
    },
  })
  const meta = [lesson.environmentLabel, lesson.periodTypeLabel].filter(Boolean).join(' · ')
  return (
    // The dragged copy is rendered by <DragOverlay> in the page (a portal, so it
    // is not clipped by the panel); the source tile only dims while dragging.
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
        position:'relative'
      }}
      className="group flex items-center gap-2 w-full text-start px-2.5 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] cursor-grab active:cursor-grabbing hover:border-[var(--accent)] hover:bg-[var(--accent-light)] transition-colors"
    >
      <HiOutlineBars2 className="text-[15px] text-[var(--text-muted)] group-hover:text-[var(--accent)] shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          {lesson.lessonNumber && (
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-light)] text-[var(--accent)] shrink-0">
              {lesson.lessonNumber}
            </span>
          )}
          <span className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
            {lesson.lessonTitle || t('schedule.addLesson')}
          </span>
        </span>
        {meta && <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{meta}</span>}
      </span>
      {placed > 0 && (
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)] shrink-0" style={{position:'absolute',bottom:5,right:5}}>
          {t('schedule.alreadyScheduled')}{placed > 1 ? ` ×${placed}` : ''}
        </span>
      )}
    </div>
  )
}

// Right-side panel listing the selected course's lessons as draggable tiles. The
// teacher drags a tile onto the calendar to place it (day/week → exact dropped
// time, month → after the day's last lesson). Replaces the old picker modal.
export default function LessonPanel() {
  const { t } = useI18n()
  const schedule = useScheduleManagementStore(selectCourseSchedule)
  const closeLessonPicker = useScheduleManagementStore(s => s.closeLessonPicker)

  const lessons = schedule?.lessons ?? []
  const placedCount = useMemo(() => {
    const m = new Map<number, number>()
    for (const d of schedule?.days ?? [])
      for (const p of d.items ?? [])
        m.set(p.lessonId, (m.get(p.lessonId) ?? 0) + 1)
    return m
  }, [schedule])

  return (
    <aside className="w-60 shrink-0 flex flex-col rounded-[12px] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-[var(--border)]">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold text-[var(--text-primary)] truncate">
            {t('schedule.lessonsPanelTitle')}
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">{t('schedule.lessonsPanelHint')}</p>
        </div>
        <button
          type="button"
          onClick={closeLessonPicker}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 shrink-0"
          aria-label="Close"
        >
          <HiOutlineXMark className="text-[18px]" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar-light p-2 flex flex-col gap-1.5">
        {lessons.length === 0 ? (
          <p className="text-[var(--text-muted)] text-[13px] text-center py-10">
            {t('schedule.noCourseLessons')}
          </p>
        ) : (
          lessons.map(l => (
            <LessonTile key={l.id} lesson={l} placed={placedCount.get(l.id) ?? 0} />
          ))
        )}
      </div>
    </aside>
  )
}
