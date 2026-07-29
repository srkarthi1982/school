import { TABS, isTabVisible, isTabComplete } from './catalogue'
import useEditorStore from './editor-store'
import { confirmDialog } from '../../../../infra/shared/store/useConfirmStore'

interface TabBarProps {
  // Locked tabs (outside this allow-list) show as complete — see isTabComplete.
  editableTabNos?: string[]
}

export default function TabBar({ editableTabNos }: TabBarProps) {
  const { activeTabNo, tabCache, setActiveTab, dirty } = useEditorStore()

  const handleClick = async (tabNo: string, implemented: boolean) => {
    if (!implemented) return
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Discard unsaved changes?',
        message: 'You have unsaved changes. Continue without saving?',
        confirmLabel: 'Discard',
        tone: 'danger',
      }))
    )
      return
    setActiveTab(tabNo)
  }

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
      {TABS.filter((tab) => isTabVisible(tab, tabCache)).map((tab) => {
        const isActive = tab.no === activeTabNo
        const isComplete = isTabComplete(tab.no, tabCache, editableTabNos)
        const disabled = !tab.implemented
        return (
          <button
            key={tab.no}
            type="button"
            disabled={disabled}
            onClick={() => handleClick(tab.no, tab.implemented)}
            title={disabled ? 'Coming soon' : tab.name}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold border-none transition-all duration-150 disabled:cursor-not-allowed"
            style={{
              background: isActive ? 'var(--accent-light)' : 'transparent',
              color: disabled
                ? 'var(--text-muted)'
                : isActive
                ? 'var(--accent)'
                : 'var(--text-muted)',
              opacity: disabled ? 0.55 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {tab.name}
            {isComplete && (
              <span className="ml-0.5 w-2 h-2 rounded-full bg-[#16A34A] inline-block" />
            )}
          </button>
        )
      })}
    </div>
  )
}
