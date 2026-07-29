import { create } from 'zustand'
import { createUserApiV1UsersPost, listCountriesApiV1SharedCountryGet, listUsersApiV1UsersGet as listUsers } from '../../../../api/generated'
import { client } from '../../../../api/client'
import type { CountryResponse, SuccessResponseUserResponse, UserCreate, UserResponse } from '../../../../api/generated'
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
  createUser: (o: UserCreate) => Promise<void>
  fetchCoutries: () => Promise<CountryResponse[]>
}

const useAdminStore = create<AdminState>((set, get) => ({
  users: [],

  fetchUsers: async () => {
    const { data } = await listUsers({ query: { page_size: 50 } })
    if ((data as any)?.success) {
      set({ users: (data as any).data ?? [] })
    }
  },

  updateUser: async (id, payload) => {
    const { data, error } = await (client as any).put({
      url: `/api/v1/users/${id}`,
      body: payload,
      headers: { 'Content-Type': 'application/json' },
    })
    if (error) throw new Error(extractErrorMessage(error))
    if (!(data as any)?.success) throw new Error(extractErrorMessage(data))
    await get().fetchUsers()
  },
  createUser: async (o: UserCreate) => {
    const { data, error } = await createUserApiV1UsersPost({ body: o })
    if (data?.success) {
      await get().fetchUsers()
      return;
    }
    throw new Error(extractErrorMessage(error))
  },
  fetchCoutries: async () => {
    const response = await listCountriesApiV1SharedCountryGet()
    if (response.data) {
      return response.data.data
    }
    // response.data?.data
    // const {data:{data}} = await listCountriesApiV1SharedCountryGet()
    // return data
    return []
  }
}))

export const selectUsers = (state: AdminState) => state.users

export default useAdminStore
