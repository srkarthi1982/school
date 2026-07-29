import { create } from 'zustand'
import { TABS } from './catalogue'

export interface TabDataEntry {
  status: string
  // Tab payloads are typed objects (e.g. GeneralInformationData), not opaque
  // JSON strings — each tab stores its own typed shape in its own table.
  data: unknown | null
}

interface EditorState {
  courseInfoId: number | null
  courseTitle: string
  version: number
  activeTabNo: string
  tabCache: Record<string, TabDataEntry>
  dirty: boolean
  pendingData: unknown | null
  // True while a tab is editing a nested sub-item in a focused panel (e.g. the
  // Lesson Creation detail view). The editor footer hides its Save controls and
  // locks tab navigation so the only Save/Cancel are the sub-item's own — the
  // footer's Save would otherwise persist without the in-progress sub-item edits.
  editingSubItem: boolean

  setCourseInfo: (id: number, title: string, version: number) => void
  setActiveTab: (tabNo: string) => void
  cacheTabData: (tabNo: string, entry: TabDataEntry) => void
  cacheTabStatus: (tabNo: string, status: string) => void
  markDirty: (data: unknown) => void
  clearDirty: () => void
  setEditingSubItem: (editing: boolean) => void
  reset: () => void
}

const firstTabNo = TABS[0]?.no ?? 'general'

const useEditorStore = create<EditorState>((set) => ({
  courseInfoId: null,
  courseTitle: '',
  version: 1,
  activeTabNo: firstTabNo,
  tabCache: {},
  dirty: false,
  pendingData: null,
  editingSubItem: false,

  setCourseInfo: (id, title, version) =>
    set({ courseInfoId: id, courseTitle: title, version }),

  setActiveTab: (tabNo) => set({ activeTabNo: tabNo }),

  cacheTabData: (tabNo, entry) =>
    set((state) => ({
      tabCache: { ...state.tabCache, [tabNo]: entry },
    })),

  // Update only the status for a tab; preserve any data already loaded into
  // the cache so a concurrent full-tab fetch isn't clobbered with ``null``.
  cacheTabStatus: (tabNo, status) =>
    set((state) => ({
      tabCache: {
        ...state.tabCache,
        [tabNo]: { status, data: state.tabCache[tabNo]?.data ?? null },
      },
    })),

  markDirty: (data) => set({ dirty: true, pendingData: data }),
  clearDirty: () => set({ dirty: false, pendingData: null }),
  setEditingSubItem: (editing) => set({ editingSubItem: editing }),
  reset: () =>
    set({
      courseInfoId: null,
      courseTitle: '',
      version: 1,
      activeTabNo: firstTabNo,
      tabCache: {},
      dirty: false,
      pendingData: null,
      editingSubItem: false,
    }),
}))

export default useEditorStore
