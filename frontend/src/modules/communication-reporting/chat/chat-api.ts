import { client } from '../../../api/client'
import {
  meApiV1ChatMeGet                                                  as chatMeRaw,
  getConversationsApiV1ChatConversationsGet                         as getConversationsRaw,
  getConversationApiV1ChatConversationsConversationIdGet            as getConversationRaw,
  createOrGetConversationApiV1ChatConversationsDirectPost           as createOrGetConversationRaw,
  getConversationMessagesApiV1ChatConversationsConversationIdMessagesGet as getMessagesRaw,
  postMessageApiV1ChatConversationsConversationIdMessagesPost       as postMessageRaw,
  deleteMessageEndpointApiV1ChatConversationsConversationIdMessagesMessageIdDelete as deleteMessageRaw,
  readConversationApiV1ChatConversationsConversationIdReadPost      as readConversationRaw,
  uploadAttachmentApiV1ChatAttachmentsPost                          as uploadAttachmentRaw,
  studentDirectoryApiV1StudentChatStudentsGet                       as studentDirectoryRaw,
  teacherStudentDirectoryApiV1TeacherChatStudentsGet                as teacherDirectoryRaw,
  listAgentsApiV1AgentsGet                                          as listAgentsRaw,
  createOrGetAgentConversationApiV1ChatConversationsAgentPost       as createOrGetAgentConversationRaw,
  getProfileApiV1ProfileInfoUserIdGet                               as getProfileRaw,
} from '../../../api/generated'
import type {
  AppModulesChatCommonSchemasUserReference as UserReference,
  AgentReference,
  ConversationSummaryResponse,
  ConversationDetailResponse,
  MessageListResponse,
  MessageResponse,
  AttachmentResponse,
} from '../../../api/generated'
import type { PermissionCode } from '../../../infra/shared/types/permissions'
import { canAccess } from '../../../infra/shared/utils/menuUtils';

const photoCache = new Map<number, string | 'error'>()

export function getPhotoFromCache(userId: number): string | null {
  return photoCache.get(userId) ?? null
}

export function markPhotoCached(userId: number, url: string): void {
  photoCache.set(userId, url)
}

export function markPhotoError(userId: number): void {
  photoCache.set(userId, 'error')
}

export async function fetchUserProfilePhoto(userId: number): Promise<void> {
  const cached = photoCache.get(userId)
  if (cached) return

  try {
    const { data } = await getProfileRaw({ path: { user_id: String(userId) } })
    const photo = (data as any)?.data?.personalInformation?.photo
    if (photo) {
      photoCache.set(userId, `data:image/png;base64,${photo}`)
    } else {
      photoCache.set(userId, 'error')
    }
  } catch {
    photoCache.set(userId, 'error')
  }
}

export async function batchFetchPhotos(userIds: number[]): Promise<void> {
  const uncached = new Set(userIds)
  for (const existing of userIds) {
    if (photoCache.has(existing)) {
      uncached.delete(existing)
    }
  }
  if (uncached.size === 0) return

  await Promise.all([...uncached].map((id) => fetchUserProfilePhoto(id)))
}

async function unwrap<T>(p: Promise<{ data?: T; error?: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  if (data === undefined) throw new Error('Empty response')
  return data
}

export const chatMe = (): Promise<UserReference> =>
  unwrap(chatMeRaw())

export const getConversations = (): Promise<ConversationSummaryResponse[]> =>
  unwrap(getConversationsRaw())

export const getConversation = (conversationId: string): Promise<ConversationDetailResponse> =>
  unwrap(getConversationRaw({ path: { conversation_id: conversationId } }))

export const createOrGetDirectConversation = (
  participantId: number,
): Promise<ConversationDetailResponse> =>
  unwrap(createOrGetConversationRaw({ body: { participant_id: participantId } }))

export const getAgents = (): Promise<AgentReference[]> =>
  unwrap(listAgentsRaw()).then((r) => r.items)

// Optional document scope makes it a per-document chat (kind='agent_doc'):
// pass the library material's numeric id OR the lesson material file's UUID.
export const createOrGetAgentConversation = (
  agentId: string,
  document?: { libraryMaterialId?: number; materialFileId?: string },
): Promise<ConversationDetailResponse> =>
  unwrap(
    createOrGetAgentConversationRaw({
      body: {
        agent_id: agentId,
        library_material_id: document?.libraryMaterialId ?? null,
        material_file_id: document?.materialFileId ?? null,
      },
    }),
  )

export const getMessages = (
  conversationId: string,
  limit = 50,
  offset = 0,
): Promise<MessageListResponse> =>
  unwrap(
    getMessagesRaw({
      path: { conversation_id: conversationId },
      query: { limit, offset },
    }),
  )

export const sendMessageRest = (
  conversationId: string,
  content: string,
  attachmentIds: string[] = [],
  replyToId?: string,
): Promise<MessageResponse> =>
  unwrap(
    postMessageRaw({
      path: { conversation_id: conversationId },
      body: { content, attachment_ids: attachmentIds, reply_to_id: replyToId ?? null },
    }),
  )

export const markRead = (conversationId: string): Promise<unknown> =>
  unwrap(readConversationRaw({ path: { conversation_id: conversationId } }))

// "Clear chat" clears the conversation for the current user only. The backend
// records a per-participant cleared_at timestamp; the other participant's
// history is unaffected. Uses the raw client so it works before the generated
// SDK is regenerated (run `npm run generate-api` to pick up the typed helper).
export interface ClearConversationResult {
  conversation_id: string
  cleared_at: string
}

export const clearConversation = (
  conversationId: string,
): Promise<ClearConversationResult> =>
  unwrap(
    client.post<ClearConversationResult>({
      url: `/api/v1/chat/conversations/${conversationId}/clear`,
    }),
  )

// "Delete conversation" removes the conversation from the current user's list
// (and clears their view of the history). The other participant keeps their
// side; new activity resurfaces the conversation. Uses the raw client so it
// works before the generated SDK is regenerated (`npm run generate-api`).
export interface DeleteConversationResult {
  conversation_id: string
  deleted_at: string
}

export const deleteConversation = (
  conversationId: string,
): Promise<DeleteConversationResult> =>
  unwrap(
    client.delete<DeleteConversationResult>({
      url: `/api/v1/chat/conversations/${conversationId}`,
    }),
  )

export const deleteMessage = (conversationId: string, messageId: string): Promise<MessageResponse> =>
  unwrap(
    deleteMessageRaw({
      path: { conversation_id: conversationId, message_id: messageId },
    }),
  )

// Set/replace/remove the current user's reaction on a received message. Sending
// the emoji already on the message toggles it off. Reactions are only allowed on
// messages the user received (the backend rejects reacting to your own). Uses the
// raw client so it works before the generated SDK is regenerated
// (`npm run generate-api` to pick up the typed helper).
export const setReaction = async (
  conversationId: string,
  messageId: string,
  emoji: string,
): Promise<MessageResponse> => {
  const { data, error } = await client.post({
    url: `/api/v1/chat/conversations/${conversationId}/messages/${messageId}/reactions`,
    body: { emoji },
  })
  if (error) throw error
  if (data === undefined) throw new Error('Empty response')
  return data as MessageResponse
}

export const uploadAttachment = (file: File): Promise<AttachmentResponse> =>
  unwrap(
    uploadAttachmentRaw({
      body: { file },
    }),
  )

export const getStudentDirectory = (q?: string, limit = 50): Promise<UserReference[]> =>
  unwrap(studentDirectoryRaw({ query: { q, limit } })).then((r) => r.items)

export const getTeacherDirectory = (q?: string, limit = 50): Promise<UserReference[]> =>
  unwrap(teacherDirectoryRaw({ query: { q, limit } })).then((r) => r.items)

export function loadDirectoryFor(
  permissions: ReadonlySet<PermissionCode>,
  query: string,
): Promise<UserReference[]> {
  
  const isStudent = canAccess({permissions:["student:read"]},permissions)
  const isTeacher = canAccess({permissions:["teacher:read"]},permissions)

  if (isStudent) return getStudentDirectory(query)
  if (isTeacher) return getTeacherDirectory(query)
  
  
  return Promise.resolve([])
}

export function wsUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/api/v1/chat/ws?token=${encodeURIComponent(token)}`
}

export function attachmentUrl(attachmentId: string): string {
  const token = localStorage.getItem('access_token')
  const base = `/api/v1/chat/attachments/${attachmentId}`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export function thumbnailUrl(attachmentId: string): string {
  const token = localStorage.getItem('access_token')
  const base = `/api/v1/chat/attachments/${attachmentId}/thumbnail`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}
