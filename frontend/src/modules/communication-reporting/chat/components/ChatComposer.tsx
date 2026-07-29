import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HiOutlinePaperAirplane,
  HiOutlinePaperClip,
  HiOutlineXMark,
  HiOutlinePhoto,
  HiOutlineDocumentText,
  HiOutlineFilm,
  HiOutlineExclamationCircle,
  HiOutlineFaceSmile,
} from 'react-icons/hi2'
import useToastStore from '../../../../infra/shared/store/useToastStore'
import { generateId } from '../../../../infra/shared/utils/uid'
import useChatStore from '../chat-store'
import useTypingEmitter from '../hooks/useTypingEmitter'
import { useChatSenders } from '../ChatSocketContext'
import { uploadAttachment } from '../chat-api'
import EmojiPicker from './EmojiPicker'
import type { AttachmentResponse } from '../../../../api/generated'
import type { MessageResponse } from '../chat-types'

interface Props {
  conversationId: string
  disabled?: boolean
  onSend: (content: string, attachmentIds: string[]) => void
  placeholder: string
  sendLabel: string
  replyTarget?: MessageResponse | null
  onCancelReply?: () => void
  replyingToLabel?: string
  attachmentLabel?: string
}

const MAX_LEN = 4000
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_FILES = 5

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'application/json',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/mpeg',
]

interface PendingUpload {
  localId: string
  file: File
  progress: number
  status: 'uploading' | 'done' | 'error'
  attachmentId?: string
  previewUrl?: string
}

function fileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return <HiOutlinePhoto className="text-lg" />
  if (contentType.startsWith('video/')) return <HiOutlineFilm className="text-lg" />
  return <HiOutlineDocumentText className="text-lg" />
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ChatComposer({
  conversationId,
  disabled,
  onSend,
  placeholder,
  sendLabel,
  replyTarget,
  onCancelReply,
  replyingToLabel,
  attachmentLabel,
}: Props) {
  const senders = useChatSenders()
  const draft = useChatStore((s) => s.drafts[conversationId] ?? '')
  const setDraft = useChatStore((s) => s.setDraft)
  const { emit, flushOff } = useTypingEmitter(conversationId, senders)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiAreaRef = useRef<HTMLDivElement>(null)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [showEmoji, setShowEmoji] = useState(false)

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [draft])

  // Picking a message to reply to should put the cursor in the input.
  useEffect(() => {
    if (replyTarget) taRef.current?.focus()
  }, [replyTarget?.id])

  useEffect(() => {
    if (!showEmoji) return
    const onDocClick = (e: MouseEvent) => {
      if (!emojiAreaRef.current?.contains(e.target as Node)) setShowEmoji(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowEmoji(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [showEmoji])

  const insertEmoji = (emoji: string) => {
    const ta = taRef.current
    const start = ta?.selectionStart ?? draft.length
    const end = ta?.selectionEnd ?? draft.length
    const next = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, MAX_LEN)
    setDraft(conversationId, next)
    emit(next)
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      const pos = Math.min(start + emoji.length, next.length)
      ta.setSelectionRange(pos, pos)
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value.slice(0, MAX_LEN)
    setDraft(conversationId, v)
    emit(v)
  }

  const handleSend = () => {
    const trimmed = draft.trim()
    const doneUploads = pendingUploads.filter((u) => u.status === 'done' && u.attachmentId)
    if ((!trimmed && doneUploads.length === 0) || disabled) return
    onSend(trimmed, doneUploads.map((u) => u.attachmentId!))
    setDraft(conversationId, '')
    setPendingUploads([])
    flushOff()
    requestAnimationFrame(() => taRef.current?.focus())
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const removeUpload = (localId: string) => {
    setPendingUploads((prev) => {
      const removed = prev.find((u) => u.localId === localId)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((u) => u.localId !== localId)
    })
  }

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    if (pendingUploads.length + files.length > MAX_FILES) {
      useToastStore
        .getState()
        .push({ variant: 'warning', title: `Maximum ${MAX_FILES} files per message` })
      return
    }

    const newUploads: PendingUpload[] = files.map((file) => {
      const localId = generateId()
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      return { localId, file, progress: 0, status: 'uploading', previewUrl }
    })

    setPendingUploads((prev) => [...prev, ...newUploads])

    for (const upload of newUploads) {
      if (upload.file.size > MAX_FILE_SIZE) {
        setPendingUploads((prev) =>
          prev.map((u) => (u.localId === upload.localId ? { ...u, status: 'error' } : u)),
        )
        continue
      }
      if (!ALLOWED_TYPES.includes(upload.file.type)) {
        setPendingUploads((prev) =>
          prev.map((u) => (u.localId === upload.localId ? { ...u, status: 'error' } : u)),
        )
        continue
      }

      try {
        const result: AttachmentResponse = await uploadAttachment(upload.file)
        setPendingUploads((prev) =>
          prev.map((u) =>
            u.localId === upload.localId
              ? { ...u, status: 'done', attachmentId: result.id, progress: 100 }
              : u,
          ),
        )
      } catch {
        setPendingUploads((prev) =>
          prev.map((u) => (u.localId === upload.localId ? { ...u, status: 'error' } : u)),
        )
      }
    }
  }, [pendingUploads.length])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void addFiles(files)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (images.length === 0) return
    e.preventDefault()
    const stamp = Date.now()
    const named = images.map((f, i) => {
      const ext = (f.type.split('/')[1] ?? 'png').replace('+xml', '')
      return new File([f], `pasted-image-${stamp}${i > 0 ? `-${i}` : ''}.${ext}`, { type: f.type })
    })
    void addFiles(named)
  }

  const remaining = MAX_LEN - draft.length
  const canSend = (draft.trim().length > 0 || pendingUploads.some((u) => u.status === 'done')) && !disabled

  return (
    <div className="border-t border-[var(--border)] px-3 py-2.5 shrink-0">
      {/* Reply banner */}
      {replyTarget && (
        <div
          className="flex items-center gap-2 rounded-lg border-s-2 px-2.5 py-1.5 mb-2"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--accent)' }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--accent)' }}>
              {replyingToLabel ?? 'Replying to'} {replyTarget.sender.display_name}
            </p>
            {replyTarget.content ? (
              <p className="text-[11.5px] text-muted truncate">{replyTarget.content}</p>
            ) : (
              <p className="text-[11.5px] text-muted truncate inline-flex items-center gap-1">
                <HiOutlinePaperClip className="shrink-0" /> {attachmentLabel ?? 'Attachment'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 p-0.5 rounded hover:bg-black/5 text-muted"
            aria-label="Cancel reply"
          >
            <HiOutlineXMark className="text-sm" />
          </button>
        </div>
      )}

      {/* Attachment previews */}
      {pendingUploads.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingUploads.map((upload) => (
            <div
              key={upload.localId}
              className="relative flex items-center gap-2 rounded-lg border bg-[var(--surface-2)] px-2 py-1.5 text-[12px] max-w-[200px]"
              style={{ borderColor: 'var(--border)' }}
            >
              {upload.previewUrl ? (
                <img
                  src={upload.previewUrl}
                  alt=""
                  className="w-8 h-8 rounded object-cover shrink-0"
                />
              ) : (
                <span className="shrink-0 text-muted">{fileIcon(upload.file.type)}</span>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium text-primary">{upload.file.name}</p>
                <p className="text-[10px] text-muted">
                  {upload.status === 'uploading' && 'Uploading...'}
                  {upload.status === 'done' && formatSize(upload.file.size)}
                  {upload.status === 'error' && (
                    <span className="text-red-500 inline-flex items-center gap-0.5">
                      <HiOutlineExclamationCircle /> Failed
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeUpload(upload.localId)}
                className="shrink-0 p-0.5 rounded hover:bg-black/5 text-muted"
              >
                <HiOutlineXMark className="text-sm" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-end gap-2 rounded-[12px] border bg-[var(--surface-2)] px-3 py-1 focus-within:border-[var(--accent)] transition-colors cursor-text"
        style={{ borderColor: 'var(--border)' }}
        onClick={() => taRef.current?.focus()}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || pendingUploads.length >= MAX_FILES}
          className="shrink-0 p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-40"
          aria-label="Attach file"
        >
          <HiOutlinePaperClip className="text-[18px]" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept={ALLOWED_TYPES.join(',')}
        />
        <div ref={emojiAreaRef} className="relative shrink-0 flex -ms-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            disabled={disabled}
            className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors disabled:opacity-40"
            aria-label="Insert emoji"
            aria-expanded={showEmoji}
          >
            <HiOutlineFaceSmile className="text-[18px]" />
          </button>
          {showEmoji && <EmojiPicker onPick={insertEmoji} />}
        </div>
        <textarea
          ref={taRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          onBlur={flushOff}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 resize-none bg-transparent text-[13.5px] text-primary placeholder:text-muted focus:outline-none leading-[1.45] max-h-40 py-[5px]"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label={sendLabel}
          className="flex items-center justify-center p-[9px] rounded-[10px] text-white shrink-0 transition-opacity disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          <HiOutlinePaperAirplane className="text-[12px] rotate-[-30deg] rtl:rotate-[210deg]" />
        </button>
      </div>
      {remaining < 500 && (
        <p
          className="text-[10.5px] mt-1 text-end"
          style={{ color: remaining < 0 ? '#DC2626' : 'var(--text-muted)' }}
        >
          {remaining}
        </p>
      )}
    </div>
  )
}
