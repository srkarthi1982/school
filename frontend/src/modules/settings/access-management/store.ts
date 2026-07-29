import { create } from 'zustand'
import {
  listPermissionsApiV1AccessPermissionsGet as listPermissions,
  listRolesApiV1AccessRolesGet as listRoles,
  createRoleApiV1AccessRolesPost as createRoleApi,
  updateRoleApiV1AccessRolesRoleIdPut as updateRoleApi,
  deleteRoleApiV1AccessRolesRoleIdDelete as deleteRoleApi,
  updateRolePermissionsApiV1AccessRolesRoleIdPermissionsPut as updateRolePermissionsApi,
  updateUserRolesApiV1AccessUsersUserIdRolesPut as updateUserRolesApi,
} from '../../../api/generated'
import type {
  PermissionResponse,
  RoleResponse,
  RoleCreate,
  RoleUpdate,
  UserRoleAssignment,
} from '../../../api/generated'
import { extractErrorMessage } from '../../../infra/shared/utils/apiError'

interface AccessManagementState {
  permissions: PermissionResponse[]
  roles: RoleResponse[]
  loading: boolean
  error: string | null

  fetchPermissions: () => Promise<void>
  fetchRoles: () => Promise<void>
  createRole: (payload: RoleCreate) => Promise<void>
  updateRole: (id: number, payload: RoleUpdate) => Promise<void>
  deleteRole: (id: number) => Promise<void>
  updateRolePermissions: (id: number, codes: string[]) => Promise<void>
  updateUserRoles: (userId: number, roleNames: string[], version: number) => Promise<void>
  clearError: () => void
}

const useAccessManagementStore = create<AccessManagementState>((set, get) => ({
  permissions: [],
  roles: [],
  loading: false,
  error: null,

  fetchPermissions: async () => {
    set({ loading: true, error: null })
    const { data, error } = await listPermissions({})
    if (error) {
      set({ error: extractErrorMessage(error), loading: false })
    } else {
      set({ permissions: (data as any)?.data ?? [], loading: false })
    }
  },

  fetchRoles: async () => {
    set({ loading: true, error: null })
    const { data, error } = await listRoles({})
    if (error) {
      set({ error: extractErrorMessage(error), loading: false })
    } else {
      set({ roles: (data as any)?.data ?? [], loading: false })
    }
  },

  createRole: async (payload) => {
    set({ loading: true, error: null })
    const { data, error } = await createRoleApi({ body: payload })
    if (error) {
      set({ error: extractErrorMessage(error), loading: false })
      throw new Error(extractErrorMessage(error))
    }
    if (!(data as any)?.success) {
      const msg = extractErrorMessage(data)
      set({ error: msg, loading: false })
      throw new Error(msg)
    }
    await get().fetchRoles()
    set({ loading: false })
  },

  updateRole: async (id, payload) => {
    set({ loading: true, error: null })
    const { data, error } = await updateRoleApi({
      path: { role_id: id },
      body: payload,
    })
    if (error) {
      set({ error: extractErrorMessage(error), loading: false })
      throw new Error(extractErrorMessage(error))
    }
    if (!(data as any)?.success) {
      const msg = extractErrorMessage(data)
      set({ error: msg, loading: false })
      throw new Error(msg)
    }
    await get().fetchRoles()
    set({ loading: false })
  },

  deleteRole: async (id) => {
    set({ loading: true, error: null })
    const { error } = await deleteRoleApi({ path: { role_id: id } })
    if (error) {
      set({ error: extractErrorMessage(error), loading: false })
      throw new Error(extractErrorMessage(error))
    }
    await get().fetchRoles()
    set({ loading: false })
  },

  updateRolePermissions: async (id, codes) => {
    set({ loading: true, error: null })
    const { data, error } = await updateRolePermissionsApi({
      path: { role_id: id },
      body: { permission_codes: codes },
    })
    if (error) {
      set({ error: extractErrorMessage(error), loading: false })
      throw new Error(extractErrorMessage(error))
    }
    if (!(data as any)?.success) {
      const msg = extractErrorMessage(data)
      set({ error: msg, loading: false })
      throw new Error(msg)
    }
    await get().fetchRoles()
    set({ loading: false })
  },

  updateUserRoles: async (userId, roleNames, version) => {
    set({ loading: true, error: null })
    const payload: UserRoleAssignment = { role_names: roleNames, version }
    const { data, error } = await updateUserRolesApi({
      path: { user_id: userId },
      body: payload,
    })
    if (error) {
      set({ error: extractErrorMessage(error), loading: false })
      throw new Error(extractErrorMessage(error))
    }
    if (!(data as any)?.success) {
      const msg = extractErrorMessage(data)
      set({ error: msg, loading: false })
      throw new Error(msg)
    }
    set({ loading: false })
  },

  clearError: () => set({ error: null }),
}))

export default useAccessManagementStore
