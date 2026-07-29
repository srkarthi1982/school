import { IMPLEMENTED_TAB_NOS, TOTAL_TAB_COUNT, isTabComplete } from './catalogue'
import useEditorStore from './editor-store'

interface EditorProgressBarProps {
  // Tabs outside this allow-list are locked/inherited and counted as complete
  // (Course Selection passes ['lesson_creation']). Undefined = all editable.
  editableTabNos?: string[]
}

export default function EditorProgressBar({ editableTabNos }: EditorProgressBarProps) {
  const { tabCache } = useEditorStore()
  const completed = Array.from(IMPLEMENTED_TAB_NOS).filter(
    (tabNo) => isTabComplete(tabNo, tabCache, editableTabNos),
  ).length
  const pct = TOTAL_TAB_COUNT > 0 ? Math.round((completed / TOTAL_TAB_COUNT) * 100) : 0

  return (
    <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--surface)]">
      <span className="text-[11px] font-bold text-muted tracking-[0.06em] uppercase shrink-0">
        Overall Progress
      </span>
      <div className="flex-1 progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11.5px] font-bold text-accent shrink-0">{pct}%</span>
      <span className="text-[11px] text-muted shrink-0">
        {completed}/{TOTAL_TAB_COUNT} tabs
      </span>
    </div>
  )
}
