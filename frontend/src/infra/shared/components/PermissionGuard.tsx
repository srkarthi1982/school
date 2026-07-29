import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import useAuthStore, {
  selectLoading,
  selectUserPermissions,
} from '../../auth/useAuthStore'
import type { PermissionPattern } from '../types/permissions'
import { canAccess } from '../utils/menuUtils'

export default function PermissionGuard({
  permissions,
  children,
}: {
  permissions?: PermissionPattern[]
  children: ReactNode
}) {
  const loading = useAuthStore(selectLoading)
  const userPerms = useAuthStore(selectUserPermissions)
  if (loading) return null
  if (permissions?.length && !canAccess({ permissions }, userPerms)) {
    // Pass the required permissions so the Access Denied page can show which
    // permission the user is missing (canAccess is OR — denial means the user
    // matches none of these, so the whole list is what they lack).
    return <Navigate to="/unauthorized" replace state={{ required: permissions }} />
  }
  return <>{children}</>
}
