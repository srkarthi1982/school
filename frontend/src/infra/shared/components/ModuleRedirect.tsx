import { Navigate } from 'react-router-dom'
import useAuthStore, { selectLoading, selectUserPermissions } from '../../auth/useAuthStore'
import type { PermissionPattern, SubMenuItem } from '../types/permissions'
import { canAccess, joinPath, toNavPath } from '../utils/menuUtils'

type Props = {
  basePath: string
  children: SubMenuItem[]
  parentPermissions?: PermissionPattern[]
}

export default function ModuleRedirect({ basePath, children, parentPermissions }: Props) {
  const loading = useAuthStore(selectLoading)
  const userPerms = useAuthStore(selectUserPermissions)
  if (loading) return null
  const target = children.find(c =>
    canAccess(
      { permissions: c.permissions ?? parentPermissions },
      userPerms,
    ),
  )
  if (!target) {
    // No child of this module is accessible — surface every permission that
    // would have granted access (any one suffices) so Access Denied can show it.
    const required = Array.from(
      new Set(children.flatMap((c) => c.permissions ?? parentPermissions ?? [])),
    )
    return <Navigate to="/unauthorized" replace state={{ required }} />
  }
  return <Navigate to={toNavPath(joinPath(basePath, target.path))} replace />
}
