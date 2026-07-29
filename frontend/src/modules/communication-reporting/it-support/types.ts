// IT-Support feature types — re-exported from the generated OpenAPI client so
// the UI always matches the backend schema.
export type {
  TicketDetail,
  TicketSummary,
  TicketHistoryEntry,
  UserSummary as User,
} from '../../../api/generated/types.gen'

export type ItTicketStatus = 'submitted' | 'approved' | 'declined' | 'viewed' | 'resolved'

// Which server-side inbox to load. 'all' requires the ticket:view_all permission.
export type BoxFilter = 'inbox' | 'all'
