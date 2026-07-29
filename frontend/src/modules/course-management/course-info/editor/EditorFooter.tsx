import { useEffect, useCallback } from 'react'
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineDocumentArrowUp,
} from 'react-icons/hi2'
import { TABS, isTabVisible } from './catalogue'
import useEditorStore from './editor-store'
import type { TabDataEntry } from './editor-store'
import AutoSaveIndicator from './AutoSaveIndicator'
import { confirmDialog } from '../../../../infra/shared/store/useConfirmStore'

interface EditorFooterProps {
  onSaveDraft: () => void
  onNavigate: (tabNo: string) => void
  onClose: () => void
  onSaveAndClose: () => void
  /** When provided, an Import button is shown on the General Information tab. */
  onImport?: () => void
  canImport?: boolean
  /** Forces the footer into read-only mode (hides Save controls), independent
   *  of tab completion — used to lock instance tabs in Course Selection. */
  readOnly?: boolean
  isSaving?: boolean
  isSavingDraft?: boolean
  lastAutoSavedAt?: Date | null
}

function findImplementedAround(
  currentTabNo: string,
  direction: 1 | -1,
  tabCache: Record<string, TabDataEntry>,
): string | null {
  const idx = TABS.findIndex((t) => t.no === currentTabNo)
  if (idx === -1) return null
  let i = idx + direction
  while (i >= 0 && i < TABS.length) {
    // Skip unimplemented tabs and gated tabs that aren't visible yet.
    if (TABS[i].implemented && isTabVisible(TABS[i], tabCache)) return TABS[i].no
    i += direction
  }
  return null
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 flex-none" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
      <path className="opacity-75" fill="currentColor" d="M8 2a6 6 0 0 1 6 6h-2a4 4 0 0 0-4-4V2z" />
    </svg>
  )
}

export default function EditorFooter({
  onSaveDraft,
  onNavigate,
  onClose,
  onSaveAndClose,
  onImport,
  canImport = false,
  readOnly = false,
  isSaving = false,
  isSavingDraft = false,
  lastAutoSavedAt = null,
}: EditorFooterProps) {
  const { dirty, activeTabNo, tabCache, editingSubItem } = useEditorStore()

  const prev = findImplementedAround(activeTabNo, -1, tabCache)
  const next = findImplementedAround(activeTabNo, 1, tabCache)
  const busySaving = isSaving || isSavingDraft
  // A completed (or externally locked) tab is read-only — hide the Save controls
  // (and disable their shortcuts). The tab can still be navigated or closed.
  // A tab editing a nested sub-item (e.g. a Lesson Creation lesson) likewise
  // hides the footer Save controls so it isn't confused with the sub-item's own
  // Save — and locks tab navigation so the in-progress edit can't be stranded.
  const isTabComplete = tabCache[activeTabNo]?.status === 'complete' || readOnly
  const hideSaveControls = isTabComplete || editingSubItem

  const handlePrev = useCallback(async () => {
    if (!prev || editingSubItem) return
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
    onNavigate(prev)
  }, [prev, dirty, editingSubItem, onNavigate])

  const handleNext = useCallback(async () => {
    if (!next || editingSubItem) return
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
    onNavigate(next)
  }, [next, dirty, editingSubItem, onNavigate])

  // Keyboard shortcuts: Ctrl+S → Save draft, Ctrl+Enter → Save, Esc → Close, Ctrl+←/→ → Prev/Next
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && e.key === 's') {
        e.preventDefault()
        if (!busySaving && !hideSaveControls) onSaveDraft()
      } else if (ctrl && e.key === 'Enter') {
        e.preventDefault()
        if (!busySaving && !hideSaveControls) onSaveAndClose()
      } else if (e.key === 'Escape') {
        // While a sub-item is open, Esc must not close the editor — the lesson's
        // own Cancel is the only exit so its uncommitted draft can't be lost.
        if (!editingSubItem) onClose()
      } else if (ctrl && e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrev()
      } else if (ctrl && e.key === 'ArrowRight') {
        e.preventDefault()
        handleNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [busySaving, hideSaveControls, editingSubItem, onSaveDraft, onSaveAndClose, onClose, handlePrev, handleNext])

  return (
    <footer
      className="flex items-center gap-5 px-5 bg-[var(--surface)] border-t border-[var(--border)] sticky bottom-0 z-10"
      style={{ height: 64, boxShadow: '0 -1px 0 rgba(0,0,0,0.04), 0 -8px 16px -8px rgba(0,0,0,0.06)' }}
    >
      {/* Zone 1: Tab navigation */}
      <div className="flex items-center gap-2" role="group" aria-label="Tab navigation">
        <button
          type="button"
          onClick={handlePrev}
          disabled={!prev || busySaving || editingSubItem}
          title="Previous tab (Ctrl+←)"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[var(--text-muted)] text-[13px] font-medium transition-[background-color,color] duration-[120ms] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <HiOutlineChevronLeft className="w-4 h-4 flex-none" />
          Previous
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!next || busySaving || editingSubItem}
          title="Next tab (Ctrl+→)"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[var(--text-muted)] text-[13px] font-medium transition-[background-color,color] duration-[120ms] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <HiOutlineChevronRight className="w-4 h-4 flex-none" />
        </button>
        {onImport && canImport && !editingSubItem && (
          <button
            type="button"
            onClick={onImport}
            disabled={busySaving}
            title="Import General Information from a .docx file"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[var(--text-muted)] text-[13px] font-medium transition-[background-color,color] duration-[120ms] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <HiOutlineDocumentArrowUp className="w-4 h-4 flex-none" />
            Import
          </button>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {editingSubItem ? (
        <span className="text-[12px] text-[var(--text-muted)]">
          Finish the lesson with its own Save or Cancel to continue.
        </span>
      ) : (
        <AutoSaveIndicator lastAutoSavedAt={lastAutoSavedAt} />
      )}

      {/* Zone 2: Form actions */}
      <div className="flex items-center gap-2" role="group" aria-label="Form actions">
        <button
          type="button"
          onClick={onClose}
          disabled={busySaving || editingSubItem}
          title={editingSubItem ? 'Finish the lesson first (use its Save or Cancel)' : undefined}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[var(--text-muted)] text-[13px] font-medium transition-[background-color,color] duration-[120ms] hover:bg-[#fef3f2] hover:text-[#b42318] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Close
        </button>

        {!hideSaveControls && (
          <>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={busySaving}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-[13px] font-medium transition-[background-color] duration-[120ms] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSavingDraft && <Spinner />}
              Save draft
            </button>

            <button
              type="button"
              onClick={onSaveAndClose}
              disabled={busySaving}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--accent)] border border-[var(--accent)] text-white text-[13px] font-medium transition-[opacity] duration-[120ms] hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ boxShadow: '0 1px 2px rgba(6,85,92,0.25)' }}
            >
              {isSaving && <Spinner />}
              Save
            </button>
          </>
        )}
      </div>
    </footer>
  )
}
