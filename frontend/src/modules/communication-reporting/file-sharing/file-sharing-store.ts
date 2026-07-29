import { create } from 'zustand'
import type { Folder, FileItem, BreadcrumbItem } from './file-sharing-api'

interface FileSharingState {
  currentFolderId: string | null
  breadcrumbs: BreadcrumbItem[]
  folders: Folder[]
  files: FileItem[]
  loading: boolean
  uploading: boolean
  totalFiles: number
  fileLimit: number
  fileOffset: number

  setCurrentFolderId: (id: string | null) => void
  setBreadcrumbs: (items: BreadcrumbItem[]) => void
  setFolders: (folders: Folder[]) => void
  setFiles: (files: FileItem[], total: number, limit: number, offset: number) => void
  setLoading: (loading: boolean) => void
  setUploading: (uploading: boolean) => void
  appendFiles: (files: FileItem[], total: number) => void
  removeFile: (id: string) => void
  removeFolder: (id: string) => void
  addFolder: (folder: Folder) => void
  updateFolder: (folder: Folder) => void
  updateFile: (file: FileItem) => void
}

export const useFileSharingStore = create<FileSharingState>((set) => ({
  currentFolderId: null,
  breadcrumbs: [],
  folders: [],
  files: [],
  loading: false,
  uploading: false,
  totalFiles: 0,
  fileLimit: 20,
  fileOffset: 0,

  setCurrentFolderId: (id) => set({ currentFolderId: id }),
  setBreadcrumbs: (items) => set({ breadcrumbs: items }),
  setFolders: (folders) => set({ folders }),
  setFiles: (files, total, limit, offset) => set({ files, totalFiles: total, fileLimit: limit, fileOffset: offset }),
  setLoading: (loading) => set({ loading }),
  setUploading: (uploading) => set({ uploading }),
  appendFiles: (files, total) =>
    set((state) => ({
      files: [...state.files, ...files],
      totalFiles: total,
      fileOffset: state.fileOffset + files.length,
    })),
  removeFile: (id) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      totalFiles: state.totalFiles - 1,
    })),
  removeFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
    })),
  addFolder: (folder) =>
    set((state) => ({
      folders: [...state.folders, folder],
    })),
  updateFolder: (folder) =>
    set((state) => ({
      folders: state.folders.map((f) => (f.id === folder.id ? folder : f)),
    })),
  updateFile: (file) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === file.id ? file : f)),
    })),
}))
