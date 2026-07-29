import '../../../../api/client'

export interface MaterialDetail {
  id: number
  course_instance_id: number
  title: string
  status: 'incomplete' | 'complete'
  course_status: string
  material_completion: number
  root_folder_count: number
  root_file_count: number
}

export interface MaterialStatus {
  material_id: number
  status: 'incomplete' | 'complete'
  material_completion: number
}

export interface MaterialFolder {
  id: string
  material_id: number
  parent_id: string | null
  lesson_id: number | null
  name: string
  created_by_id: number | null
  created_at: string
  updated_at: string
}

export interface MaterialFile {
  id: string
  material_id: number
  folder_id: string | null
  lesson_id: number | null
  filename: string
  content_type: string
  file_size: number
  uploader: { id: number; username: string; full_name: string } | null
  created_at: string
  updated_at: string
  download_url?: string
  library_material_id?: number | null
}

export interface MaterialBreadcrumbItem {
  id: string
  name: string
}

export interface MaterialLesson {
  id: number
  lesson_number: string | null
  lesson_title: string | null
  order_index: number
  file_count: number
  // True when this lesson's material differs from the master.
  modified?: boolean
}

export interface SharedMaterialFile extends MaterialFile {
  source_lesson_id: number
  source_lesson_number: string | null
  source_lesson_title: string | null
}

export interface AddMaterialRequest {
  file_id: string
  target_lesson_id?: number | null
}

interface ApiEnvelope<T> {
  success?: boolean
  data?: T
  error?: { message?: string }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token')
  const res = await fetch(`/api/v1${url}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  })
  if (!res.ok) {
    const err: ApiEnvelope<T> = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || res.statusText)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  const json: ApiEnvelope<T> = await res.json()
  return (json.data ?? (json as unknown as T)) as T
}

// --- Material (per course instance) ---

// Seeds the instance's material from its master on first call, then returns it.
export const ensureInstanceMaterial = (courseId: number): Promise<MaterialDetail> =>
  apiFetch(`/courses/${courseId}/material`, { method: 'POST' })

export const getMaterial = (materialId: number): Promise<MaterialDetail> =>
  apiFetch(`/course-selection-materials/${materialId}`)

export const markMaterialComplete = (materialId: number): Promise<MaterialStatus> =>
  apiFetch(`/course-selection-materials/${materialId}/complete`, { method: 'POST' })

export const unmarkMaterialComplete = (materialId: number): Promise<MaterialStatus> =>
  apiFetch(`/course-selection-materials/${materialId}/incomplete`, { method: 'POST' })

// --- Lessons ---

export const listMaterialLessons = (
  materialId: number,
): Promise<{ items: MaterialLesson[]; total: number }> =>
  apiFetch(`/course-selection-materials/${materialId}/lessons`)

// --- Folders ---

export const listMaterialFolders = (
  materialId: number,
  parentId?: string,
  lessonId?: number,
  order?: 'asc' | 'desc',
): Promise<{ items: MaterialFolder[]; total: number }> => {
  const params = new URLSearchParams()
  if (parentId) params.set('parent_id', parentId)
  if (lessonId != null) params.set('lesson_id', String(lessonId))
  if (order) params.set('order', order)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiFetch(`/course-selection-materials/${materialId}/folders${qs}`)
}

export const createMaterialFolder = (
  materialId: number,
  name: string,
  parentId?: string,
  lessonId?: number,
): Promise<MaterialFolder> =>
  apiFetch(`/course-selection-materials/${materialId}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId || null, lesson_id: lessonId ?? null }),
  })

export const renameMaterialFolder = (folderId: string, name: string): Promise<MaterialFolder> =>
  apiFetch(`/course-selection-materials/folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

export const deleteMaterialFolder = (folderId: string): Promise<void> =>
  apiFetch(`/course-selection-materials/folders/${folderId}`, { method: 'DELETE' })

export const getMaterialBreadcrumb = (folderId: string): Promise<MaterialBreadcrumbItem[]> =>
  apiFetch(`/course-selection-materials/folders/${folderId}/breadcrumb`)

// --- Files ---

export const listMaterialFiles = (
  materialId: number,
  folderId?: string,
  lessonId?: number,
  limit = 50,
  offset = 0,
): Promise<{ items: MaterialFile[]; total: number; limit: number; offset: number }> => {
  const params = new URLSearchParams()
  if (folderId) params.set('folder_id', folderId)
  if (lessonId != null) params.set('lesson_id', String(lessonId))
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return apiFetch(`/course-selection-materials/${materialId}/files?${params.toString()}`)
}

export const uploadMaterialFile = (
  materialId: number,
  file: File,
  folderId?: string,
  lessonId?: number,
  totalPages?: number,
): Promise<{ id: string; filename: string; content_type: string; file_size: number; library_material_id?: number }> => {
  const formData = new FormData()
  formData.append('file', file)
  if (totalPages != null) formData.append('total_pages', String(totalPages))
  const params = new URLSearchParams()
  if (folderId) params.set('folder_id', folderId)
  if (lessonId != null) params.set('lesson_id', String(lessonId))
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiFetch(`/course-selection-materials/${materialId}/files${qs}`, {
    method: 'POST',
    body: formData,
  })
}

export const downloadMaterialFile = async (fileId: string, filename: string): Promise<void> => {
  const token = localStorage.getItem('access_token')
  const res = await fetch(`/api/v1/course-selection-materials/files/${fileId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || res.statusText)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const renameMaterialFile = (fileId: string, filename: string): Promise<MaterialFile> =>
  apiFetch(`/course-selection-materials/files/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  })

export const deleteMaterialFile = (fileId: string): Promise<void> =>
  apiFetch(`/course-selection-materials/files/${fileId}`, { method: 'DELETE' })

// --- Shared / existing materials (duplicate from another lesson) ---

export const listSharedMaterialFiles = (
  materialId: number,
  excludeLessonId?: number,
  limit = 200,
  offset = 0,
): Promise<{ items: SharedMaterialFile[]; total: number }> => {
  const params = new URLSearchParams()
  if (excludeLessonId != null) params.set('exclude_lesson_id', String(excludeLessonId))
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return apiFetch(`/course-selection-materials/${materialId}/shared-files?${params.toString()}`)
}

export const addExistingMaterialFile = (
  materialId: number,
  data: AddMaterialRequest,
): Promise<MaterialFile> =>
  apiFetch(`/course-selection-materials/${materialId}/add-material`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
