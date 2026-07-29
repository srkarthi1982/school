import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineArrowLeft,
  HiOutlineArrowUpTray,
  HiOutlineBookOpen,
  HiOutlineChevronRight,
  HiOutlineCloudArrowUp,
  HiOutlineDocumentArrowDown,
  HiOutlineDocumentText,
  HiOutlineExclamationCircle,
  HiOutlineEye,
  HiOutlineFilm,
  HiOutlineFolder,
  HiOutlineFolderPlus,
  HiOutlineMusicalNote,
  HiOutlinePencil,
  HiOutlinePhoto,
  HiOutlineTrash,
} from 'react-icons/hi2'
import useAuthStore, { selectUser, selectUserPermissions } from '../../../infra/auth/useAuthStore'
import { canAccess } from '../../../infra/shared/utils/menuUtils'
import { estimatePages } from '../../../infra/shared/utils/estimatePages'
import {
  createMaterialFolder,
  deleteMaterialFile,
  deleteMaterialFolder,
  downloadMaterialFile,
  ensureCourseMasterMaterial,
  getMaterialBreadcrumb,
  listMaterialFiles,
  listMaterialFolders,
  listMaterialLessons,
  renameMaterialFile,
  renameMaterialFolder,
  uploadMaterialFile,
} from './material-api'
import type { MaterialFile, MaterialFolder, MaterialLesson } from './material-api'
import { useMaterialStore } from './material-store'
import AddExistingMaterialModal from './components/AddExistingMaterialModal'
import MaterialNewFolderModal from './components/MaterialNewFolderModal'
import MaterialUploadModal from './components/MaterialUploadModal'
import SummarizingStatusPill from '../../../infra/shared/components/SummarizingStatusPill'
import useFullBleedStore from "../../../infra/shared/store/useFullBleedStore.ts";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeLabel(contentType: string, filename: string = ''): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pptx' || ext === 'ppt') return 'PPTX'
  if (ext === 'docx' || ext === 'doc') return 'DOCX'
  if (ext === 'xlsx' || ext === 'xls') return 'XLSX'
  if (ext === 'pdf') return 'PDF'
  if (contentType.includes('pdf')) return 'PDF'
  if (contentType.includes('word') || contentType.includes('document')) return 'DOCX'
  if (contentType.includes('excel') || contentType.includes('sheet')) return 'XLSX'
  if (contentType.includes('powerpoint') || contentType.includes('presentation')) return 'PPTX'
  if (contentType.startsWith('image/')) return contentType.split('/')[1].toUpperCase()
  if (contentType.startsWith('video/')) return contentType.split('/')[1].toUpperCase()
  if (contentType.startsWith('audio/')) return contentType.split('/')[1].toUpperCase()
  return 'FILE'
}

function FileIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith('image/')) return <HiOutlinePhoto className="text-[20px]" />
  if (contentType.startsWith('video/')) return <HiOutlineFilm className="text-[20px]" />
  if (contentType.startsWith('audio/')) return <HiOutlineMusicalNote className="text-[20px]" />
  return <HiOutlineDocumentText className="text-[20px]" />
}

function lessonLabel(lesson: MaterialLesson | null): string {
  if (!lesson) return 'Lesson'
  const parts = [lesson.lesson_number, lesson.lesson_title].filter(Boolean)
  return parts.length ? parts.join(' · ') : `Lesson ${lesson.order_index + 1}`
}

export default function CourseBuilderMaterialLessonPage() {
  const { id, lessonId: lessonIdParam } = useParams<{ id: string; lessonId: string }>()
  const masterId = Number(id)
  const lessonId = Number(lessonIdParam)
  const navigate = useNavigate()
  const location = useLocation()
  const materialPath = `/course-management/course-builder/${masterId}/category/material`

  const user = useAuthStore(selectUser)
  const permissions = useAuthStore(selectUserPermissions)
  const hasWrite = canAccess({ permissions: ['material:write'] }, permissions)
  const hasDelete = canAccess({ permissions: ['material:delete'] }, permissions)
  const isAdmin = user?.roles?.some((r: string) => r.toLowerCase() === 'admin') ?? false

  const {
    materialId,
    status,
    currentFolderId,
    breadcrumbs,
    folders,
    files,
    loading,
    uploading,
    setMaterial,
    setCurrentLessonId,
    setCurrentFolderId,
    setBreadcrumbs,
    setFolders,
    setFiles,
    setLoading,
    setUploading,
    addFolder,
    updateFolder,
    updateFile,
    reset,
  } = useMaterialStore(
    useShallow((s) => ({
      materialId: s.materialId,
      status: s.status,
      currentFolderId: s.currentFolderId,
      breadcrumbs: s.breadcrumbs,
      folders: s.folders,
      files: s.files,
      loading: s.loading,
      uploading: s.uploading,
      setMaterial: s.setMaterial,
      setCurrentLessonId: s.setCurrentLessonId,
      setCurrentFolderId: s.setCurrentFolderId,
      setBreadcrumbs: s.setBreadcrumbs,
      setFolders: s.setFolders,
      setFiles: s.setFiles,
      setLoading: s.setLoading,
      setUploading: s.setUploading,
      addFolder: s.addFolder,
      updateFolder: s.updateFolder,
      updateFile: s.updateFile,
      reset: s.reset,
    })),
  )

  const store = useMaterialStore()

  const lessonFromState = (location.state as { lesson?: MaterialLesson } | null)?.lesson ?? null
  const [lesson, setLesson] = useState<MaterialLesson | null>(lessonFromState)
  const [error, setError] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showAddExisting, setShowAddExisting] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState<MaterialFolder | null>(null)
  const [renamingFile, setRenamingFile] = useState<MaterialFile | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null)

  // Reset store when leaving so a different lesson/master starts fresh
  useEffect(() => {
    return () => {
      reset()
    }
  }, [reset])

  // Resolve (or create) the material for this course master, scoped to the lesson
  useEffect(() => {
    if (!Number.isFinite(masterId) || !Number.isFinite(lessonId)) {
      setError('Invalid course or lesson id')
      setBootstrapping(false)
      return
    }
    let cancelled = false
    setBootstrapping(true)
    setCurrentLessonId(lessonId)
    ensureCourseMasterMaterial(masterId)
      .then(async (data) => {
        if (cancelled) return
        setMaterial(data.id, data.status, data.course_master_completion)
        if (!lessonFromState) {
          const res = await listMaterialLessons(data.id)
          if (cancelled) return
          setLesson(res.items.find((l) => l.id === lessonId) ?? null)
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Failed to load material')
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false)
      })
    return () => {
      cancelled = true
    }
  }, [masterId, lessonId, lessonFromState, setMaterial, setCurrentLessonId])

  const refresh = useCallback(async () => {
    if (!materialId) return
    setLoading(true)
    try {
      const [folderRes, fileRes] = await Promise.all([
        listMaterialFolders(materialId, currentFolderId ?? undefined, lessonId, 'asc'),
        listMaterialFiles(materialId, currentFolderId ?? undefined, lessonId),
      ])
      setFolders(folderRes.items)
      setFiles(fileRes.items, fileRes.total)
      if (currentFolderId) {
        const bc = await getMaterialBreadcrumb(currentFolderId)
        setBreadcrumbs(bc)
      } else {
        setBreadcrumbs([])
      }
    } finally {
      setLoading(false)
    }
  }, [materialId, currentFolderId, lessonId, setFolders, setFiles, setBreadcrumbs, setLoading])

  useEffect(() => {
    refresh()
  }, [refresh])

  const combinedItems = useMemo(() => {
    const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name))
    const sortedFiles = [...files].sort((a, b) => a.filename.localeCompare(b.filename))
    return [
      ...sortedFolders.map((f) => ({ type: 'folder' as const, data: f })),
      ...sortedFiles.map((f) => ({ type: 'file' as const, data: f })),
    ]
  }, [folders, files])

  const handleCreateFolder = async (name: string) => {
    if (!materialId) return
    // Only the lesson root is scoped by lessonId; sub-folders inherit it server-side.
    const folder = await createMaterialFolder(
      materialId,
      name,
      currentFolderId ?? undefined,
      currentFolderId ? undefined : lessonId,
    )
    addFolder(folder)
    setShowNewFolder(false)
  }

  const handleUpload = async (incoming: File[]) => {
    if (!materialId) return
    setUploading(true)
    try {
      const results = await Promise.allSettled(
        incoming.map((f) => estimatePages(f).then((pages) =>
          uploadMaterialFile(
            materialId,
            f,
            currentFolderId ?? undefined,
            currentFolderId ? undefined : lessonId,
            pages,
          ),
        )),
      )
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const data = result.value as { id: string; library_material_id?: number }
          if (data.library_material_id) {
            store.setLibraryFileMapping(data.id, data.library_material_id)
          }
        }
      }
      await refresh()
    } finally {
      setUploading(false)
      setShowUpload(false)
    }
  }

  const handleAdded = () => {
    refresh()
  }

  // Fill the content area edge-to-edge (drops Layout's standard frame padding).
  const setFullBleed = useFullBleedStore((s) => s.setFullBleed)
  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, [setFullBleed])

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'folder') {
        await deleteMaterialFolder(deleteTarget.id)
      } else {
        await deleteMaterialFile(deleteTarget.id)
      }
      await refresh()
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleRenameFolder = async (name: string) => {
    if (!renamingFolder) return
    const updated = await renameMaterialFolder(renamingFolder.id, name)
    updateFolder(updated)
    setRenamingFolder(null)
  }

  const handleRenameFile = async (name: string) => {
    if (!renamingFile) return
    const updated = await renameMaterialFile(renamingFile.id, name)
    updateFile(updated)
    setRenamingFile(null)
  }

  const openInLibrary = useCallback((fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file?.library_material_id) return;
    navigate(`/course-management/library/view/${file.library_material_id}`);
  }, [files, navigate]);

  if (bootstrapping) {
    return <div className="p-6 text-sm text-muted">Loading lesson material…</div>
  }

  if (error || !materialId) {
    return (
      <div className="px-6 py-4">
        <button
          onClick={() => navigate(materialPath)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary mb-4 bg-transparent border-none cursor-pointer p-0"
        >
          <HiOutlineArrowLeft className="text-[14px]" />
          Back to Lessons
        </button>
        <div className="text-sm text-red-500">{error ?? 'Material not found'}</div>
      </div>
    )
  }

  const isComplete = status === 'complete'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(materialPath)}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0 shrink-0"
          >
            <HiOutlineArrowLeft className="text-[14px]" />
            Lessons
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em] shrink-0">
            <HiOutlineBookOpen className="text-[11px]" />
            Material
          </div>
          <span className="text-[13px] font-bold text-primary truncate">{lessonLabel(lesson)}</span>
        </div>
      </div>

      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setCurrentFolderId(null)}
            className="text-[12.5px] font-semibold text-accent hover:underline cursor-pointer bg-transparent border-none p-0 shrink-0"
          >
            Lesson root
          </button>
          {breadcrumbs.map((bc) => (
            <div key={bc.id} className="flex items-center gap-2 shrink-0">
              <HiOutlineChevronRight className="text-[12px] text-muted" />
              <button
                type="button"
                onClick={() => setCurrentFolderId(bc.id)}
                className="text-[12.5px] font-semibold text-accent hover:underline cursor-pointer bg-transparent border-none p-0"
              >
                {bc.name}
              </button>
            </div>
          ))}
        </div>

        {hasWrite && !isComplete && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAddExisting(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <HiOutlineDocumentArrowDown className="text-[14px]" />
              Add existing
            </button>
            <button
              type="button"
              onClick={() => setShowNewFolder(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <HiOutlineFolderPlus className="text-[14px]" />
              New folder
            </button>
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-white text-[12px] font-semibold cursor-pointer transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              <HiOutlineArrowUpTray className="text-[14px]" />
              Upload file
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar-light px-6 py-6">
        {loading && files.length === 0 && folders.length === 0 ? (
          <p className="text-[12.5px] text-muted py-8 text-center">Loading…</p>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-4"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <HiOutlineCloudArrowUp className="text-[24px]" />
            </div>
            <p className="text-[14px] font-semibold text-primary mb-1">No material yet</p>
            <p className="text-[12.5px] text-muted">Upload files or create folders for this lesson.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {combinedItems.map((item) =>
              item.type === 'folder' ? (
                <div key={item.data.id} className="card px-5 py-4 flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                  >
                    <HiOutlineFolder className="text-[20px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold text-primary">{item.data.name}</h3>
                    <p className="text-[11.5px] text-muted mt-0.5">Folder</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(item.data.id)}
                    className="text-[12px] font-semibold text-accent hover:underline cursor-pointer bg-transparent border-none p-0 shrink-0"
                  >
                    Open →
                  </button>
                  {hasWrite && !isComplete && (isAdmin || item.data.created_by_id === user?.id) && (
                    <button
                      type="button"
                      onClick={() => setRenamingFolder(item.data)}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
                      aria-label="Rename folder"
                    >
                      <HiOutlinePencil className="text-[16px]" />
                    </button>
                  )}
                  {hasDelete && !isComplete && (isAdmin || item.data.created_by_id === user?.id) && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ type: 'folder', id: item.data.id, name: item.data.name })}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 transition-colors"
                      aria-label="Delete folder"
                    >
                      <HiOutlineTrash className="text-[16px]" />
                    </button>
                  )}
                </div>
              ) : (
                <div key={item.data.id} className="card px-5 py-4 flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                  >
                    <FileIcon contentType={item.data.content_type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold text-primary truncate">{item.data.filename}</h3>
                    <p className="text-[11.5px] text-muted mt-0.5">
                      {fileTypeLabel(item.data.content_type, item.data.filename)} · {formatSize(item.data.file_size)}
                      {item.data.uploader && ` · ${item.data.uploader.full_name || item.data.uploader.username}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadMaterialFile(item.data.id, item.data.filename)}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline shrink-0 bg-transparent border-none p-0 cursor-pointer"
                  >
                    <HiOutlineDocumentArrowDown className="text-[14px]" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => openInLibrary(item.data.id)}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline shrink-0 bg-transparent border-none p-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Open in Library"
                  >
                    <HiOutlineEye className="text-[14px]" />
                  </button>
                  {hasWrite && !isComplete && (isAdmin || item.data.uploader?.id === user?.id) && (
                    <button
                      type="button"
                      onClick={() => setRenamingFile(item.data)}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
                      aria-label="Rename file"
                    >
                      <HiOutlinePencil className="text-[16px]" />
                    </button>
                  )}
                  {hasDelete && !isComplete && (isAdmin || item.data.uploader?.id === user?.id) && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ type: 'file', id: item.data.id, name: item.data.filename })}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 transition-colors"
                      aria-label="Delete file"
                    >
                      <HiOutlineTrash className="text-[16px]" />
                    </button>
                  )}
                  {item.data.library_material_id && (
                    <div className="shrink-0 flex items-center">
                      <SummarizingStatusPill materialId={item.data.library_material_id} />
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {showNewFolder && (
        <MaterialNewFolderModal
          open={showNewFolder}
          onClose={() => setShowNewFolder(false)}
          onCreate={handleCreateFolder}
          title="New folder"
          placeholder="Folder name"
          createLabel="Create folder"
        />
      )}

      {showUpload && (
        <MaterialUploadModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
          onUpload={handleUpload}
          title="Upload material"
          dropLabel="Drop files here or click to browse"
          uploading={uploading}
        />
      )}

      {showAddExisting && materialId && (
        <AddExistingMaterialModal
          open={showAddExisting}
          onClose={() => setShowAddExisting(false)}
          materialId={materialId}
          targetLessonId={lessonId}
          onAdd={handleAdded}
        />
      )}

      {renamingFolder && (
        <MaterialNewFolderModal
          open={!!renamingFolder}
          onClose={() => setRenamingFolder(null)}
          onCreate={handleRenameFolder}
          title="Rename folder"
          placeholder="Folder name"
          createLabel="Rename"
          initialValue={renamingFolder.name}
        />
      )}

      {renamingFile && (
        <MaterialNewFolderModal
          open={!!renamingFile}
          onClose={() => setRenamingFile(null)}
          onCreate={handleRenameFile}
          title="Rename file"
          placeholder="File name"
          createLabel="Rename"
          initialValue={renamingFile.filename}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border bg-[var(--surface)] shadow-md p-6"
            style={{ borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 rounded-full bg-red-500/10">
                <HiOutlineExclamationCircle className="text-red-500 text-xl" />
              </div>
              <div>
                <p className="text-base font-bold text-primary">Confirm delete</p>
                <p className="text-sm text-secondary mt-1">
                  {deleteTarget.type === 'folder'
                    ? `Delete folder "${deleteTarget.name}" and everything inside it? This cannot be undone.`
                    : `Delete file "${deleteTarget.name}"? This cannot be undone.`}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary bg-transparent border border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white bg-red-500 hover:opacity-90 transition-opacity border-none cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
