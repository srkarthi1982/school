import '../../../api/client'

export interface Folder {
  id: string
  parent_id: string | null
  name: string
  created_by_id: number | null
  created_at: string
  updated_at: string
}

export interface FileItem {
  id: string
  folder_id: string | null
  filename: string
  content_type: string
  file_size: number
  uploader: { id: number; username: string; full_name: string } | null
  created_at: string
  updated_at: string
  download_url?: string
}

export interface BreadcrumbItem {
  id: string
  name: string
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
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message || res.statusText)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  const json = await res.json()
  return (json.data ?? json) as T
}

export const listFolders = (parentId?: string, order?: string): Promise<{ items: Folder[]; total: number }> => {
  const params = new URLSearchParams()
  if (parentId) params.set('parent_id', parentId)
  if (order) params.set('order', order)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return apiFetch(`/file-sharing/folders${qs}`)
}

export const createFolder = (name: string, parentId?: string): Promise<Folder> =>
  apiFetch('/file-sharing/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parent_id: parentId || null }),
  }).then((r: any) => r.data ?? r)

export const deleteFolder = (id: string): Promise<void> =>
  apiFetch(`/file-sharing/folders/${id}`, { method: 'DELETE' })

export const renameFolder = (id: string, name: string): Promise<Folder> =>
  apiFetch(`/file-sharing/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((r: any) => r.data ?? r)

export const getBreadcrumb = (folderId: string): Promise<BreadcrumbItem[]> =>
  apiFetch(`/file-sharing/folders/${folderId}/breadcrumb`).then((r: any) => r.data ?? r)

export const listFiles = (folderId?: string, limit = 20, offset = 0): Promise<{ items: FileItem[]; total: number; limit: number; offset: number }> => {
  const params = new URLSearchParams()
  if (folderId) params.set('folder_id', folderId)
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return apiFetch(`/file-sharing/files?${params.toString()}`).then((r: any) => r.data ?? r)
}

export const uploadFile = (file: File, folderId?: string): Promise<FileItem> => {
  const formData = new FormData()
  formData.append('file', file)
  const params = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : ''
  return apiFetch(`/file-sharing/files${params}`, {
    method: 'POST',
    body: formData,
  }).then((r: any) => r.data ?? r)
}

export const downloadFile = async (fileId: string, filename: string): Promise<void> => {
  const token = localStorage.getItem('access_token')
  const res = await fetch(`/api/v1/file-sharing/files/${fileId}/download`, {
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

export const renameFile = (id: string, filename: string): Promise<FileItem> =>
  apiFetch(`/file-sharing/files/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  }).then((r: any) => r.data ?? r)

export const deleteFile = (id: string): Promise<void> =>
  apiFetch(`/file-sharing/files/${id}`, { method: 'DELETE' })
