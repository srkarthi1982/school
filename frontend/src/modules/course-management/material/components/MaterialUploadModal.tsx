import { useCallback, useEffect, useState } from 'react'
import { HiOutlineCloudArrowUp, HiOutlineExclamationCircle, HiOutlineXMark } from 'react-icons/hi2'

// Mirror of MATERIAL_ALLOWED_TYPES in backend config. Client-side gate only —
// the server re-validates with the live .env list.
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'video/mp4',
  'video/quicktime',
]

const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200 MB — keep in sync with MATERIAL_MAX_FILE_SIZE_BYTES

interface Props {
  open: boolean
  onClose: () => void
  onUpload: (files: File[]) => Promise<void> | void
  title: string
  dropLabel: string
  uploading: boolean
}

interface FileEntry {
  file: File
  error: string | null
}

export default function MaterialUploadModal({ open, onClose, onUpload, title, dropLabel, uploading }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (open) {
      setFiles([])
      setDragOver(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const validate = useCallback((f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type)) return 'fileTypeNotAllowed'
    if (f.size > MAX_FILE_SIZE) return 'fileTooLarge'
    return null
  }, [])

  const handleFiles = (incoming: File[]) => {
    const mapped = incoming.map((f) => ({ file: f, error: validate(f) }))
    setFiles((prev) => [...prev, ...mapped])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length) handleFiles(dropped)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length) handleFiles(selected)
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validFiles = files.filter((f) => !f.error).map((f) => f.file)
    if (!validFiles.length || uploading) return
    await onUpload(validFiles)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--surface)] shadow-md flex flex-col"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-[15px] font-bold text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:bg-[var(--surface-2)]"
            aria-label="Close"
          >
            <HiOutlineXMark className="text-[18px]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center gap-3 rounded-[12px] border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer"
            style={{
              borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
              background: dragOver ? 'var(--accent-light)' : 'var(--surface-2)',
            }}
            onClick={() => document.getElementById('material-upload-input')?.click()}
          >
            <HiOutlineCloudArrowUp
              className="text-[32px]"
              style={{ color: dragOver ? 'var(--accent)' : 'var(--text-muted)' }}
            />
            <p className="text-[12.5px] text-muted">{dropLabel}</p>
            <p className="text-[11px] text-muted">
              PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPG, PNG, MP3, WAV, MP4, MOV · up to 200 MB
            </p>
            <input
              id="material-upload-input"
              type="file"
              multiple
              className="hidden"
              onChange={handleChange}
              accept={ALLOWED_TYPES.join(',')}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 max-h-48 overflow-y-auto thin-scrollbar-light">
              {files.map((entry, index) => (
                <div
                  key={`${entry.file.name}-${index}`}
                  className="flex items-center gap-2 rounded-[10px] border bg-[var(--surface-2)] px-3 py-2"
                  style={{ borderColor: entry.error ? 'rgb(239 68 68)' : 'var(--border)' }}
                >
                  <span
                    className="text-[12px] truncate flex-1"
                    style={{ color: entry.error ? 'rgb(239 68 68)' : 'var(--text-primary)' }}
                  >
                    {entry.file.name}
                  </span>
                  <span className="text-[11px] text-muted shrink-0">{(entry.file.size / (1024 * 1024)).toFixed(1)} MB</span>
                  {entry.error && (
                    <span
                      className="text-[11px] text-red-500 shrink-0"
                      title={entry.error === 'fileTypeNotAllowed' ? 'File type not allowed' : 'File exceeds 200 MB limit'}
                    >
                      <HiOutlineExclamationCircle className="text-[14px] inline" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(index)
                    }}
                    className="shrink-0 p-0.5 rounded text-muted hover:text-red-500 transition-colors cursor-pointer bg-transparent border-none"
                    aria-label="Remove file"
                  >
                    <HiOutlineXMark className="text-[14px]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-secondary hover:text-primary transition-colors cursor-pointer bg-transparent border border-[var(--border)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!files.some((f) => !f.error) || uploading}
              className="px-4 py-2 rounded-[8px] text-[12px] font-semibold text-white cursor-pointer transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {uploading ? 'Uploading…' : `Upload${files.filter((f) => !f.error).length > 1 ? ` (${files.filter((f) => !f.error).length})` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
