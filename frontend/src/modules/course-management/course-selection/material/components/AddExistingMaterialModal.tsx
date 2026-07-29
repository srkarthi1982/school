import { useEffect, useMemo, useRef, useState } from 'react'
import {
  HiOutlineArchiveBox,
  HiOutlineBookOpen,
  HiOutlineDocumentText,
  HiOutlineExclamationCircle,
  HiOutlineFilm,
  HiOutlineMusicalNote,
  HiOutlinePhoto,
} from 'react-icons/hi2'
import {
  addExistingMaterialFile,
  listSharedMaterialFiles,
  type SharedMaterialFile,
} from '../course-selection-material-api'

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

function FileIconIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith('image/')) return <HiOutlinePhoto className="text-[20px]" />
  if (contentType.startsWith('video/')) return <HiOutlineFilm className="text-[20px]" />
  if (contentType.startsWith('audio/')) return <HiOutlineMusicalNote className="text-[20px]" />
  return <HiOutlineDocumentText className="text-[20px]" />
}

function lessonLabel(source_lesson_number: string | null, source_lesson_title: string | null): string {
  if (!source_lesson_number && !source_lesson_title) return 'Lesson'
  const parts = [source_lesson_number, source_lesson_title].filter(Boolean)
  return parts.join(' · ')
}

export default function AddExistingMaterialModal({
  open,
  onClose,
  materialId,
  targetLessonId,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  materialId: number
  targetLessonId: number
  onAdd: () => void
}) {
  const [files, setFiles] = useState<SharedMaterialFile[]>([])
  const [loading, setLoading] = useState(false)
  const [addingFileId, setAddingFileId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')

  // Use a ref to track if the modal has already loaded on this open cycle
  // This prevents infinite re-renders from the API call triggering state updates
  const loadRef = useRef(false)

  useEffect(() => {
    if (!open) {
      loadRef.current = false
      return
    }

    // Only run once per modal open
    if (loadRef.current) return
    loadRef.current = true

    setLoading(true)
    setError(null)
    setAddedCount(0)

    listSharedMaterialFiles(materialId)
      .then((res) => {
        setFiles(res.items)
      })
      .catch((e: Error) => {
        setError(e.message || 'Failed to load existing materials')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, materialId])

  const filteredFiles = useMemo(() => {
    if (!searchTerm.trim()) return files
    const term = searchTerm.toLowerCase()
    return files.filter((f) => f.filename.toLowerCase().includes(term))
  }, [files, searchTerm])

  const groupedFiles = useMemo(() => {
    const groups: Record<string, SharedMaterialFile[]> = {}
    for (const file of filteredFiles) {
      const label = lessonLabel(file.source_lesson_number, file.source_lesson_title)
      if (!groups[label]) groups[label] = []
      groups[label].push(file)
    }
    return groups
  }, [filteredFiles])

  const handleAdd = async (fileId: string, filename: string) => {
    if (addingFileId || !materialId) return
    setAddingFileId(fileId)
    try {
      await addExistingMaterialFile(materialId, { file_id: fileId, target_lesson_id: targetLessonId })
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
      setAddedCount((c) => c + 1)
      onAdd()
    } catch (e: any) {
      setError(e.message || `Failed to add "${filename}"`)
    } finally {
      setAddingFileId(null)
    }
  }

  const handleClose = () => {
    loadRef.current = false
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={handleClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-primary">Add from existing material</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-[12px] font-semibold text-muted hover:text-primary cursor-pointer bg-transparent border-none p-0"
          >
            Cancel
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-[var(--border)]">
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 text-[13px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-primary placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4" style={{ minHeight: 0 }}>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 mb-4">
              <HiOutlineExclamationCircle className="text-red-500 text-[18px] shrink-0 mt-0.5" />
              <p className="text-[12.5px] text-red-500">{error}</p>
            </div>
          )}

          {addedCount > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 mb-4">
              <p className="text-[12.5px] text-green-500">
                {addedCount} file{addedCount > 1 ? 's' : ''} added successfully to this lesson!
              </p>
            </div>
          )}

          {loading ? (
            <p className="text-[12.5px] text-muted py-8 text-center">Loading existing materials...</p>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-4"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
              >
                <HiOutlineArchiveBox className="text-[24px]" />
              </div>
              <p className="text-[14px] font-semibold text-primary mb-1">{error ? 'Failed to load' : 'No existing material'}</p>
              <p className="text-[12.5px] text-muted">
                {error || 'No files from other lessons found in this course yet.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(groupedFiles).map(([sourceLabel, sourceFiles]) => (
                <div key={sourceLabel}>
                  <p className="text-[11.5px] font-bold text-accent tracking-[0.04em] mb-2 flex items-center gap-1.5">
                    <HiOutlineBookOpen className="text-[11px]" />
                    {sourceLabel}
                    <span className="text-[10px] text-muted font-normal">({sourceFiles.length})</span>
                  </p>
                  <div className="flex flex-col gap-2">
                    {sourceFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 px-4 py-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] hover:border-accent/30 transition-colors"
                      >
                        <div
                          className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                        >
                          <FileIconIcon contentType={file.content_type} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-primary truncate">{file.filename}</p>
                          <p className="text-[11px] text-muted mt-0.5">
                            {fileTypeLabel(file.content_type, file.filename)} · {formatSize(file.file_size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAdd(file.id, file.filename)}
                          disabled={!!addingFileId}
                          className="shrink-0 px-3 py-1.5 rounded-[8px] text-[11.5px] font-semibold text-white cursor-pointer transition-opacity disabled:opacity-40"
                          style={{ background: 'var(--accent)' }}
                        >
                          {addingFileId === file.id ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
