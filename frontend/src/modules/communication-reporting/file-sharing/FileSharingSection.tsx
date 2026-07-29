import { useEffect, useState, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  HiOutlineFolder,
  HiOutlineFolderPlus,
  HiOutlineArrowUpTray,
  HiOutlineDocumentText,
  HiOutlinePhoto,
  HiOutlineFilm,
  HiOutlineDocumentArrowDown,
  HiOutlineTrash,
  HiOutlineChevronRight,
  HiOutlineCloudArrowUp,
  HiOutlinePencil,
  HiOutlineExclamationCircle,
  HiOutlineBarsArrowUp,
  HiOutlineBarsArrowDown,
  HiOutlineFolderOpen,
  HiOutlineArrowDownTray,
} from 'react-icons/hi2'
import { useI18n } from '../../../infra/locales/I18nContext'
import useAuthStore, { selectUser, selectUserPermissions } from '../../../infra/auth/useAuthStore'
import { useFileSharingStore } from './file-sharing-store'
import {
  listFolders,
  listFiles,
  createFolder,
  deleteFolder,
  deleteFile,
  getBreadcrumb,
  downloadFile,
  uploadFile,
  renameFolder,
  renameFile,
} from './file-sharing-api'
import NewFolderModal from './components/NewFolderModal'
import UploadModal from './components/UploadModal'
import EmptyState from '../../../infra/shared/components/EmptyState'
import type { Folder, FileItem, BreadcrumbItem } from './file-sharing-api'
import {canAccess} from '../../../infra/shared/utils/menuUtils'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeLabel(contentType: string): string {
  if (contentType.includes('pdf')) return 'PDF'
  if (contentType.includes('word') || contentType.includes('document')) return 'DOCX'
  if (contentType.includes('excel') || contentType.includes('sheet')) return 'XLSX'
  if (contentType.includes('powerpoint') || contentType.includes('presentation')) return 'PPTX'
  if (contentType.startsWith('image/')) return contentType.split('/')[1].toUpperCase()
  if (contentType.startsWith('video/')) return contentType.split('/')[1].toUpperCase()
  if (contentType.startsWith('text/')) return 'TXT'
  return 'FILE'
}

function FileIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith('image/')) return <HiOutlinePhoto className="text-[20px]" />
  if (contentType.startsWith('video/')) return <HiOutlineFilm className="text-[20px]" />
  return <HiOutlineDocumentText className="text-[20px]" />
}

export default function FileSharingSection() {
  const { t } = useI18n()
  const user = useAuthStore(selectUser)
  const permissions = useAuthStore(selectUserPermissions)

  const hasWrite = canAccess({permissions:['file:write']},permissions)
  const hasDelete = canAccess({permissions:['file:delete']},permissions)

  const {
    currentFolderId,
    breadcrumbs,
    folders,
    files,
    loading,
    uploading,
    setCurrentFolderId,
    setBreadcrumbs,
    setFolders,
    setFiles,
    setLoading,
    setUploading,
    removeFile,
    removeFolder,
    addFolder,
    updateFolder,
    updateFile,
  } = useFileSharingStore(
    useShallow((s) => ({
      currentFolderId: s.currentFolderId,
      breadcrumbs: s.breadcrumbs,
      folders: s.folders,
      files: s.files,
      loading: s.loading,
      uploading: s.uploading,
      setCurrentFolderId: s.setCurrentFolderId,
      setBreadcrumbs: s.setBreadcrumbs,
      setFolders: s.setFolders,
      setFiles: s.setFiles,
      setLoading: s.setLoading,
      setUploading: s.setUploading,
      removeFile: s.removeFile,
      removeFolder: s.removeFolder,
      addFolder: s.addFolder,
      updateFolder: s.updateFolder,
      updateFile: s.updateFile,
    })),
  )

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null)
  const [renamingFile, setRenamingFile] = useState<FileItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'file' | 'folder'; id: string; name: string } | null>(null)
  const [folderOrder, setFolderOrder] = useState<'asc' | 'desc'>('asc')

  const isAdmin = user?.roles?.some((r: string) => r.toLowerCase() === 'admin') ?? false

  const combinedItems = useMemo(() => {
    const sortedFolders = [...folders].sort((a, b) =>
      folderOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    )
    const sortedFiles = [...files].sort((a, b) =>
      folderOrder === 'asc' ? a.filename.localeCompare(b.filename) : b.filename.localeCompare(a.filename),
    )
    return [
      ...sortedFolders.map((f) => ({ type: 'folder' as const, data: f })),
      ...sortedFiles.map((f) => ({ type: 'file' as const, data: f })),
    ]
  }, [folders, files, folderOrder])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [folderRes, fileRes] = await Promise.all([
        listFolders(currentFolderId ?? undefined, folderOrder),
        listFiles(currentFolderId ?? undefined),
      ])
      setFolders(folderRes.items)
      setFiles(fileRes.items, fileRes.total, fileRes.limit, fileRes.offset)

      if (currentFolderId) {
        const bc = await getBreadcrumb(currentFolderId)
        setBreadcrumbs(bc)
      } else {
        setBreadcrumbs([])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [currentFolderId, folderOrder, setFolders, setFiles, setBreadcrumbs, setLoading])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreateFolder = async (name: string) => {
    const folder = await createFolder(name, currentFolderId ?? undefined)
    addFolder(folder)
    setShowNewFolder(false)
  }

  const handleUpload = async (files: File[]) => {
    setUploading(true)
    try {
      await Promise.allSettled(files.map((file) => uploadFile(file, currentFolderId ?? undefined)))
      await refresh()
    } catch {
      // ignore
    } finally {
      setUploading(false)
      setShowUpload(false)
    }
  }

  const handleDeleteFile = (file: FileItem) => {
    setDeleteTarget({ type: 'file', id: file.id, name: file.filename })
  }

  const handleDeleteFolder = (folder: Folder) => {
    setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'folder') {
        await deleteFolder(deleteTarget.id)
      } else {
        await deleteFile(deleteTarget.id)
      }
      await refresh()
    } catch {
      // ignore
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleRenameFolder = async (name: string) => {
    if (!renamingFolder) return
    const updated = await renameFolder(renamingFolder.id, name)
    updateFolder(updated)
    setRenamingFolder(null)
  }

  const handleRenameFile = async (name: string) => {
    if (!renamingFile) return
    const updated = await renameFile(renamingFile.id, name)
    updateFile(updated)
    setRenamingFile(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setCurrentFolderId(null)}
            className="text-[12.5px] font-semibold text-accent hover:underline cursor-pointer bg-transparent border-none p-0 shrink-0"
          >
            {t('fileSharing.breadcrumbRoot')}
          </button>
          {breadcrumbs.map((bc, i) => (
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

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFolderOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
            aria-label={folderOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
            title={folderOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
          >
            {folderOrder === 'asc' ? (
              <HiOutlineBarsArrowUp className="text-[14px]" />
            ) : (
              <HiOutlineBarsArrowDown className="text-[14px]" />
            )}
          </button>
          {hasWrite && (
            <>
              <button
                type="button"
                onClick={() => setShowNewFolder(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
              >
                <HiOutlineFolderPlus className="text-[14px]" />
                {t('fileSharing.newFolder')}
              </button>
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                disabled={uploading}
                data-guide="file-sharing:upload"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-white text-[12px] font-semibold cursor-pointer transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                <HiOutlineArrowUpTray className="text-[14px]" />
                {t('fileSharing.uploadFile')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar-light pb-10">
        {loading && files.length === 0 && folders.length === 0 ? (
          <p className="text-[12.5px] text-muted py-8 text-center">{t('common.loading')}</p>
        ) : folders.length === 0 && files.length === 0 ? (
          <EmptyState
            fill
            bare
            icon={<HiOutlineFolderOpen />}
            title={t('fileSharing.emptyFolder')}
            description={t('fileSharing.emptyFolderHint')}
            hints={[
              {
                icon: <HiOutlineCloudArrowUp />,
                title: t('empty.fileSharing.uploadTitle'),
                description: t('empty.fileSharing.uploadDesc'),
              },
              {
                icon: <HiOutlineFolderPlus />,
                title: t('empty.fileSharing.organizeTitle'),
                description: t('empty.fileSharing.organizeDesc'),
              },
              {
                icon: <HiOutlineArrowDownTray />,
                title: t('empty.fileSharing.downloadTitle'),
                description: t('empty.fileSharing.downloadDesc'),
              },
            ]}
          />
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
                    <p className="text-[11.5px] text-muted mt-0.5">{t('fileSharing.folderName')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(item.data.id)}
                    className="text-[12px] font-semibold text-accent hover:underline cursor-pointer bg-transparent border-none p-0 shrink-0"
                  >
                    Open →
                  </button>
                  {hasWrite && (isAdmin || item.data.created_by_id === user?.id) && (
                    <button
                      type="button"
                      onClick={() => setRenamingFolder(item.data)}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
                      aria-label={t('fileSharing.renameFolder')}
                    >
                      <HiOutlinePencil className="text-[16px]" />
                    </button>
                  )}
                  {(isAdmin || item.data.created_by_id === user?.id) && hasDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteFolder(item.data)}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 transition-colors"
                      aria-label={t('common.delete')}
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
                      {fileTypeLabel(item.data.content_type)} · {formatSize(item.data.file_size)}
                      {item.data.uploader && ` · ${item.data.uploader.full_name || item.data.uploader.username}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadFile(item.data.id, item.data.filename)}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline shrink-0 bg-transparent border-none p-0 cursor-pointer"
                  >
                    <HiOutlineDocumentArrowDown className="text-[14px]" />
                    {t('fileSharing.download')}
                  </button>
                  {hasWrite && (isAdmin || item.data.uploader?.id === user?.id) && (
                    <button
                      type="button"
                      onClick={() => setRenamingFile(item.data)}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-accent transition-colors"
                      aria-label={t('fileSharing.renameFile')}
                    >
                      <HiOutlinePencil className="text-[16px]" />
                    </button>
                  )}
                  {(isAdmin || item.data.uploader?.id === user?.id) && hasDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(item.data)}
                      className="shrink-0 p-1.5 rounded-lg text-muted hover:text-red-500 transition-colors"
                      aria-label={t('common.delete')}
                    >
                      <HiOutlineTrash className="text-[16px]" />
                    </button>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {showNewFolder && (
        <NewFolderModal
          open={showNewFolder}
          onClose={() => setShowNewFolder(false)}
          onCreate={handleCreateFolder}
          title={t('fileSharing.newFolder')}
          placeholder={t('fileSharing.folderName')}
          createLabel={t('fileSharing.createFolder')}
        />
      )}

      {showUpload && (
        <UploadModal
          open={showUpload}
          onClose={() => setShowUpload(false)}
          onUpload={handleUpload}
          title={t('fileSharing.uploadFile')}
          dropLabel={t('fileSharing.dropFilesHere')}
          uploading={uploading}
        />
      )}

      {renamingFolder && (
        <NewFolderModal
          open={!!renamingFolder}
          onClose={() => setRenamingFolder(null)}
          onCreate={handleRenameFolder}
          title={t('fileSharing.renameFolder')}
          placeholder={t('fileSharing.folderName')}
          createLabel={t('fileSharing.rename')}
          initialValue={renamingFolder.name}
        />
      )}

      {renamingFile && (
        <NewFolderModal
          open={!!renamingFile}
          onClose={() => setRenamingFile(null)}
          onCreate={handleRenameFile}
          title={t('fileSharing.renameFile')}
          placeholder={t('fileSharing.fileName')}
          createLabel={t('fileSharing.rename')}
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
                <p className="text-base font-bold text-primary">{t('common.confirmDelete')}</p>
                <p className="text-sm text-secondary mt-1">
                  {deleteTarget.type === 'folder'
                    ? t('fileSharing.confirmDeleteFolder')
                    : t('fileSharing.confirmDeleteFile')}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary bg-transparent border border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white bg-red-500 hover:opacity-90 transition-opacity border-none cursor-pointer"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
