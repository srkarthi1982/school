import type {
  ClassSessionCreate,
  ClassSessionResponse,
  ClassSessionUpdate,
  JoinTokenResponse,
} from '../../../api/generated'

export type ClassSession = ClassSessionResponse
export type ClassSessionStatus = ClassSessionResponse['status']
export type CreateSessionPayload = ClassSessionCreate
export type UpdateSessionPayload = ClassSessionUpdate
export type JoinToken = JoinTokenResponse

export const SESSION_STATUSES: ClassSessionStatus[] = ['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED']
