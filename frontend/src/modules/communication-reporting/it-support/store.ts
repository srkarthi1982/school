// Registers the auth/refresh interceptors before any request fires.
import '../../../api/client'

import { create } from 'zustand'

import {
  approveTicketApiV1ItSupportTicketsTicketIdApprovePost as approveTicketApi,
  cancelTicketApiV1ItSupportTicketsTicketIdCancelPost as cancelTicketApi,
  claimTicketApiV1ItSupportTicketsTicketIdClaimPost as claimTicketApi,
  createTicketApiV1ItSupportTicketsPost as createTicketApi,
  declineTicketApiV1ItSupportTicketsTicketIdDeclinePost as declineTicketApi,
  forwardTicketApiV1ItSupportTicketsTicketIdForwardPost as forwardTicketApi,
  getTicketApiV1ItSupportTicketsTicketIdGet as getTicketApi,
  listTicketsApiV1ItSupportTicketsGet as listTicketsApi,
  resolveTicketApiV1ItSupportTicketsTicketIdResolvePost as resolveTicketApi,
} from '../../../api/generated'
import { throwIfError } from '../../../infra/shared/utils/apiError'
import type { BoxFilter, TicketDetail, TicketSummary } from './types'

interface State {
  tickets: TicketSummary[]
  loading: boolean
  box: BoxFilter
  fetch: (box?: BoxFilter) => Promise<void>
  loadTicket: (id: number) => Promise<TicketDetail>
  createTicket: (title: string, description: string) => Promise<TicketDetail>
  approveTicket: (id: number, targetUserId?: number | null) => Promise<TicketDetail>
  declineTicket: (id: number, reason: string) => Promise<TicketDetail>
  claimTicket: (id: number) => Promise<TicketDetail>
  resolveTicket: (id: number, note: string) => Promise<TicketDetail>
  cancelTicket: (id: number) => Promise<TicketDetail>
  forwardTicket: (id: number, toUserId: number) => Promise<TicketDetail>
}

export const useItSupportStore = create<State>((set, get) => ({
  tickets: [],
  loading: false,
  box: 'inbox',

  fetch: async (box) => {
    const effectiveBox = box ?? get().box
    set({ loading: true, box: effectiveBox })
    try {
      const { data, error } = await listTicketsApi({ query: { box: effectiveBox } })
      throwIfError(error)
      set({ tickets: data?.items ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  loadTicket: async (id) => {
    const { data, error } = await getTicketApi({ path: { ticket_id: id } })
    throwIfError(error)
    return data as TicketDetail
  },

  createTicket: async (title, description) => {
    const { data, error } = await createTicketApi({ body: { title, description } })
    throwIfError(error)
    await get().fetch()
    return data as TicketDetail
  },

  approveTicket: async (id, targetUserId) => {
    const { data, error } = await approveTicketApi({
      path: { ticket_id: id },
      body: { target_user_id: targetUserId ?? null },
    })
    throwIfError(error)
    await get().fetch()
    return data as TicketDetail
  },

  declineTicket: async (id, reason) => {
    const { data, error } = await declineTicketApi({
      path: { ticket_id: id },
      body: { reason },
    })
    throwIfError(error)
    await get().fetch()
    return data as TicketDetail
  },

  claimTicket: async (id) => {
    const { data, error } = await claimTicketApi({ path: { ticket_id: id } })
    throwIfError(error)
    await get().fetch()
    return data as TicketDetail
  },

  resolveTicket: async (id, note) => {
    const { data, error } = await resolveTicketApi({
      path: { ticket_id: id },
      body: { note },
    })
    throwIfError(error)
    await get().fetch()
    return data as TicketDetail
  },

  cancelTicket: async (id) => {
    const { data, error } = await cancelTicketApi({ path: { ticket_id: id } })
    throwIfError(error)
    await get().fetch()
    return data as TicketDetail
  },

  forwardTicket: async (id, toUserId) => {
    const { data, error } = await forwardTicketApi({
      path: { ticket_id: id },
      body: { to_user_id: toUserId },
    })
    throwIfError(error)
    await get().fetch()
    return data as TicketDetail
  },
}))
