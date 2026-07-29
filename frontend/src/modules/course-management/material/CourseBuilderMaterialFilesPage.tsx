import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  HiOutlineArrowLeft,
  HiOutlineBookOpen,
  HiOutlineDocumentArrowDown,
  HiOutlineDocumentText,
  HiOutlineFilm,
  HiOutlineEye,
  HiOutlineMagnifyingGlass,
  HiOutlineMusicalNote,
  HiOutlinePhoto,
  HiOutlineRectangleStack,
} from 'react-icons/hi2'
import {
  downloadMaterialFile,
  ensureCourseMasterMaterial,
  listSharedMaterialFiles,
} from './material-api'
import type { SharedMaterialFile } from './material-api'
import SummarizingStatusPill from '../../../infra/shared/components/SummarizingStatusPill'
import Breadcrumb, { courseCategoryCrumbs } from '../_shared/Breadcrumb'

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

function lessonLabel(file: SharedMaterialFile): string {
  const parts = [file.source_lesson_number, file.source_lesson_title].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Lesson'
}

export default function CourseBuilderMaterialFilesPage() {
  const { id } = useParams<{ id: string }>()
  const masterId = Number(id)
  const navigate = useNavigate()
  const detailPath = `/course-management/course-builder/${masterId}`
  const listPath = '/course-management/course-builder'
  const lessonsPath = `${detailPath}/category/material`

  const [files, setFiles] = useState<SharedMaterialFile[]>([])
  const [courseTitle, setCourseTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const load = useCallback(async () => {
    if (!Number.isFinite(masterId)) {
      setError('Invalid course master id')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const material = await ensureCourseMasterMaterial(masterId)
      setCourseTitle(material.title)
      const res = await listSharedMaterialFiles(material.id, undefined, 500)
      setFiles(res.items)
    } catch (e) {
      setError((e as Error).message || 'Failed to load materials')
    } finally {
      setLoading(false)
    }
  }, [masterId])

  useEffect(() => {
    load()
  }, [load])

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const sorted = [...files].sort((a, b) => a.filename.localeCompare(b.filename))
    if (!query) return sorted
    return sorted.filter(
      (f) =>
        f.filename.toLowerCase().includes(query) ||
        lessonLabel(f).toLowerCase().includes(query),
    )
  }, [files, searchQuery])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <Breadcrumb
          className="mb-2"
          items={[
            ...courseCategoryCrumbs({
              scopeLabel: 'Course Builder',
              listPath,
              courseTitle,
              detailPath,
              categoryLabel: 'Material',
            }),
            { label: 'All materials' },
          ]}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(lessonsPath)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted hover:text-primary bg-transparent border-none cursor-pointer p-0"
            >
              <HiOutlineArrowLeft className="text-[14px]" />
              Lessons
            </button>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-light text-accent text-[10.5px] font-bold tracking-[0.07em]">
              <HiOutlineRectangleStack className="text-[11px]" />
              All materials
            </div>
          </div>
        </div>
      </div>

      {/* Section heading */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[var(--border)]">
        <HiOutlineRectangleStack className="text-[15px] text-accent" />
        <span className="text-[13px] font-bold text-primary">Materials</span>
        <span className="text-[11.5px] text-muted">
          Every uploaded material across all lessons, with its linked lesson.
        </span>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-[var(--border)]">
        <div className="relative">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search materials by file name or lesson…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-[12px] rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-muted outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar-light px-6 py-6">
        {loading ? (
          <p className="text-[12.5px] text-muted py-8 text-center">Loading…</p>
        ) : error ? (
          <div className="text-sm text-red-500 py-8 text-center">{error}</div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-4"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <HiOutlineRectangleStack className="text-[24px]" />
            </div>
            <p className="text-[14px] font-semibold text-primary mb-1">No materials yet</p>
            <p className="text-[12.5px] text-muted mb-4 max-w-md">
              No files have been uploaded to any lesson yet. Open a lesson to upload its material.
            </p>
            <button
              type="button"
              onClick={() => navigate(lessonsPath)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-white text-[12px] font-semibold cursor-pointer"
              style={{ background: 'var(--accent)' }}
            >
              Go to Lessons →
            </button>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-[13px] font-semibold text-primary mb-1">
              No materials match &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-[12.5px] text-muted">Try a different search term.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredFiles.map((file) => (
              <div key={file.id} className="card px-5 py-4 flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                >
                  <FileIcon contentType={file.content_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-primary truncate">{file.filename}</h3>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-light text-accent text-[10.5px] font-semibold">
                      <HiOutlineBookOpen className="text-[11px]" />
                      {lessonLabel(file)}
                    </span>
                    <span className="text-[11.5px] text-muted">
                      {fileTypeLabel(file.content_type, file.filename)} · {formatSize(file.file_size)}
                      {file.uploader && ` · ${file.uploader.full_name || file.uploader.username}`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadMaterialFile(file.id, file.filename)}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline shrink-0 bg-transparent border-none p-0 cursor-pointer"
                >
                  <HiOutlineDocumentArrowDown className="text-[14px]" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/course-management/library/view/${file.library_material_id}`)}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline shrink-0 bg-transparent border-none p-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Open in Library"
                  disabled={!file.library_material_id}
                >
                  <HiOutlineEye className="text-[14px]" />
                </button>
                {file.library_material_id && (
                  <div className="shrink-0 flex items-center">
                    <SummarizingStatusPill materialId={file.library_material_id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
