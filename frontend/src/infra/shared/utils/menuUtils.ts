import type { ComponentType } from 'react'
import type {
  AccessRequirement,
  MenuItem,
  PermissionCode,
  PermissionPattern,
  SubMenuItem,
} from '../types/permissions'

/**
 * Match a manifest pattern against a single user permission code.
 *   - exact equality:           'user:read' === 'user:read'
 *   - global wildcard:          '*' matches anything
 *   - prefix wildcard:          'chat:*' matches 'chat:read', 'chat:write', …
 */
function permissionMatches(pattern: string, userPerm: string): boolean {
  if (pattern === userPerm) return true
  if (pattern === '*') return true
  if (pattern.endsWith(':*')) {
    return userPerm.startsWith(pattern.slice(0, -1)) // 'chat:'
  }
  return false
}

export function canAccess(
  required: AccessRequirement | undefined,
  userPerms: ReadonlySet<PermissionCode>,
): boolean {
  if (!required) return true
  const { permissions } = required
  if (!permissions || permissions.length === 0) return true // public
  for (const pattern of permissions) {
    for (const up of userPerms) {
      if (permissionMatches(pattern, up)) return true
    }
  }
  return false
}

export type FlatRoute =
  | {
      kind: 'page'
      path: string
      page: ComponentType
      permissions: PermissionPattern[] | undefined
    }
  | {
      kind: 'module-redirect'
      path: string
      basePath: string
      children: SubMenuItem[]
      parentPermissions: PermissionPattern[] | undefined
    }

export function joinPath(base: string, sub: string): string {
  const left  = base.endsWith('/')   ? base.slice(0, -1) : base
  const right = sub.startsWith('/')  ? sub.slice(1)      : sub
  return `${left}/${right}`
}

// Strip react-router wildcard suffix from a manifest path so it can be used
// as a navigation `to=` value. A feature manifest can register
// `path: 'course-builder/*'` to let its inner `<Routes>` match deeper URLs;
// the sidebar link should target `/course-management/course-builder` instead.
export function toNavPath(path: string): string {
  if (path.endsWith('/*')) return path.slice(0, -2)
  if (path.endsWith('*'))  return path.slice(0, -1)
  return path
}

export function flattenRoutes(items: MenuItem[]): FlatRoute[] {
  const out: FlatRoute[] = []

  for (const item of items) {
    if (!item.path) continue

    const hasChildren = !!item.children?.length

    if (item.page) {
      out.push({
        kind: 'page',
        path: item.path,
        page: item.page,
        permissions: item.permissions,
      })
    } else if (hasChildren) {
      out.push({
        kind: 'module-redirect',
        path: item.path,
        basePath: item.path,
        children: item.children!,
        parentPermissions: item.permissions,
      })
    }

    if (hasChildren) {
      for (const child of item.children!) {
        out.push({
          kind: 'page',
          path: joinPath(item.path, child.path),
          page: child.page,
          permissions: child.permissions ?? item.permissions,
        })
      }
    }
  }

  return out
}

// Build sidebar items visible to the user.
// Top-level items render as direct links; their children are exposed only via
// the in-page SubmenuAside (the main sidebar stays one level deep).
export function filterMenuForSidebar(
  items: MenuItem[],
  userPerms: ReadonlySet<PermissionCode>,
): MenuItem[] {
  return items
    .map(item => {
      if (!item.i18n || !item.icon || !item.path) return null
      if (!canAccess({ permissions: item.permissions }, userPerms)) return null
      return item
    })
    .filter(Boolean) as MenuItem[]
}

// Find the module entry whose path is a prefix of the current location.
// Used by Layout to decide whether to render SubmenuAside.
export function findActiveModule(items: MenuItem[], pathname: string): MenuItem | null {
  let best: MenuItem | null = null
  for (const item of items) {
    if (!item.path) continue
    if (pathname === item.path || pathname.startsWith(item.path + '/')) {
      if (!best || item.path.length > best.path!.length) best = item
    }
  }
  return best
}
