export interface TabDef {
  no: string
  name: string
  implemented: boolean
  // Derived, read-only tabs render a real component but carry no stored status
  // and don't count toward completion progress.
  preview?: boolean
  // Slug of a tab that must be 'complete' before this tab is shown at all.
  requires?: string
}

// Order is load-bearing: the footer's Previous/Next walk this array in order.
// Keep the slugs in sync with backend `course_info.services.TAB_CATALOGUE`.
export const TABS: TabDef[] = [
  { no: 'general',               name: 'General Information',    implemented: true },
  { no: 'resources',             name: 'Resources',              implemented: true },
  { no: 'lesson_planning',       name: 'Lesson Planning',        implemented: true },
  { no: 'lesson_creation',       name: 'Lesson Creation',        implemented: true },
  { no: 'personnel_requirement', name: 'Personnel Requirement',  implemented: true },
  { no: 'tp_link_preview',       name: 'TP Link Preview',        implemented: true, preview: true, requires: 'lesson_creation' },
]

// Only non-preview implemented tabs count toward progress — flipping a tab's
// flag here automatically rebalances the denominator. Keep in sync with
// backend services.py IMPLEMENTED_TAB_NOS.
export const IMPLEMENTED_TAB_NOS: ReadonlySet<string> = new Set(
  TABS.filter((t) => t.implemented && !t.preview).map((t) => t.no),
)

export const TOTAL_TAB_COUNT = IMPLEMENTED_TAB_NOS.size

// A tab gated by `requires` only becomes visible once that tab is complete.
// Used by the tab bar (to show it) and the footer (to skip it in Prev/Next).
export function isTabVisible(
  tab: TabDef,
  tabCache: Record<string, { status: string } | undefined>,
): boolean {
  if (!tab.requires) return true
  return tabCache[tab.requires]?.status === 'complete'
}

// Whether a tab counts as complete for progress/checkmarks. In Course Selection
// only the editable tabs (e.g. Lesson Creation) carry a live instance status;
// every other tab is locked, inherited from the approved master, and therefore
// always complete. `editableTabNos` undefined = Course Builder, where each tab
// carries its own status.
export function isTabComplete(
  tabNo: string,
  tabCache: Record<string, { status: string } | undefined>,
  editableTabNos?: string[],
): boolean {
  if (editableTabNos != null && !editableTabNos.includes(tabNo)) return true
  return tabCache[tabNo]?.status === 'complete'
}
