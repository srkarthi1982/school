import { create } from 'zustand'
import { listUsersApiV1UsersGet as listUsers } from '../../../../api/generated'
import { client } from '../../../../api/client'
import type { UserResponse } from '../../../../api/generated'
import { extractErrorMessage } from '../../../../infra/shared/utils/apiError'

interface UserUpdatePayload {
  email?: string
  username?: string
  full_name?: string
  roles?: string[]
  is_active?: boolean
  password?: string
  version: number
}

interface AdminState {
  users: UserResponse[]
  fetchUsers: () => Promise<void>
  updateUser: (id: number, payload: UserUpdatePayload) => Promise<void>
}

const useAdminStore = create<AdminState>((set, get) => ({
  users: [],

  fetchUsers: async () => {
    const { data } = await listUsers({})
    if ((data as any)?.success) {
      set({ users: (data as any).data ?? [] })
    }
  },

  updateUser: async (id, payload) => {
    const { data, error } = await (client as any).put({
      url: `/api/v1/admin/users/${id}`,
      body: payload,
      headers: { 'Content-Type': 'application/json' },
    })
    if (error) throw new Error(extractErrorMessage(error))
    if (!(data as any)?.success) throw new Error(extractErrorMessage(data))
    await get().fetchUsers()
  },
}))

export const selectUsers = (state: AdminState) => state.users

export default useAdminStore
