import { create } from 'zustand'
import type {
  MaterialBreadcrumbItem,
  MaterialFile,
  MaterialFolder,
  MaterialLesson,
} from './course-selection-material-api'

interface MaterialState {
  materialId: number | null
  status: 'incomplete' | 'complete'
  materialCompletion: number
  lessons: MaterialLesson[]
  currentLessonId: number | null
  currentFolderId: string | null
  breadcrumbs: MaterialBreadcrumbItem[]
  folders: MaterialFolder[]
  files: MaterialFile[]
  loading: boolean
  uploading: boolean
  totalFiles: number
  fileLibraryIdMap: Record<string, number>

  setMaterial: (id: number, status: 'incomplete' | 'complete', completion: number) => void
  setStatus: (status: 'incomplete' | 'complete', completion: number) => void
  setLessons: (lessons: MaterialLesson[]) => void
  setCurrentLessonId: (id: number | null) => void
  setCurrentFolderId: (id: string | null) => void
  setBreadcrumbs: (items: MaterialBreadcrumbItem[]) => void
  setFolders: (folders: MaterialFolder[]) => void
  setFiles: (files: MaterialFile[], total: number) => void
  setLoading: (loading: boolean) => void
  setUploading: (uploading: boolean) => void
  addFolder: (folder: MaterialFolder) => void
  updateFolder: (folder: MaterialFolder) => void
  removeFolder: (id: string) => void
  updateFile: (file: MaterialFile) => void
  removeFile: (id: string) => void
  setLibraryFileMapping: (csFileId: string, libraryId: number) => void
  clearFileMapping: (csFileId: string) => void
  reset: () => void
}

const INITIAL: Omit<MaterialState,
  | 'setMaterial' | 'setStatus' | 'setLessons' | 'setCurrentLessonId'
  | 'setCurrentFolderId' | 'setBreadcrumbs'
  | 'setFolders' | 'setFiles' | 'setLoading' | 'setUploading'
  | 'addFolder' | 'updateFolder' | 'removeFolder' | 'updateFile' | 'removeFile' | 'setLibraryFileMapping' | 'clearFileMapping' | 'reset'
> = {
  materialId: null,
  status: 'incomplete',
  materialCompletion: 0,
  lessons: [],
  currentLessonId: null,
  currentFolderId: null,
  breadcrumbs: [],
  folders: [],
  files: [],
  loading: false,
  uploading: false,
  totalFiles: 0,
  fileLibraryIdMap: {},
}

export const useCourseSelectionMaterialStore = create<MaterialState>((set) => ({
  ...INITIAL,

  setMaterial: (materialId, status, materialCompletion) =>
    set({ materialId, status, materialCompletion }),
  setStatus: (status, materialCompletion) => set({ status, materialCompletion }),
  setLessons: (lessons) => set({ lessons }),
  setCurrentLessonId: (currentLessonId) => set({ currentLessonId }),
  setCurrentFolderId: (currentFolderId) => set({ currentFolderId }),
  setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
  setFolders: (folders) => set({ folders }),
  setFiles: (files, totalFiles) => set({ files, totalFiles }),
  setLoading: (loading) => set({ loading }),
  setUploading: (uploading) => set({ uploading }),
  addFolder: (folder) => set((s) => ({ folders: [...s.folders, folder] })),
  updateFolder: (folder) =>
    set((s) => ({ folders: s.folders.map((f) => (f.id === folder.id ? folder : f)) })),
  removeFolder: (id) => set((s) => ({ folders: s.folders.filter((f) => f.id !== id) })),
  updateFile: (file) =>
    set((s) => ({ files: s.files.map((f) => (f.id === file.id ? file : f)) })),
  removeFile: (id) =>
    set((s) => ({
      files: s.files.filter((f) => f.id !== id),
      totalFiles: Math.max(0, s.totalFiles - 1),
    })),
  setLibraryFileMapping: (csFileId, libraryId) =>
    set((s) => ({ fileLibraryIdMap: { ...s.fileLibraryIdMap, [csFileId]: libraryId } })),
  clearFileMapping: (csFileId) =>
    set((s) => {
      const newMap = { ...s.fileLibraryIdMap }
      delete newMap[csFileId]
      return { fileLibraryIdMap: newMap }
    }),
  reset: () => set({ ...INITIAL }),
}))
