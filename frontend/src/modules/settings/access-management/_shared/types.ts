import type { ComponentType } from 'react'
import type { IconType } from 'react-icons'
import { HiOutlineUserCircle, HiOutlineKey, HiOutlineUserGroup } from 'react-icons/hi2'
import AccessControlPage from '../access-control/AccessControlPage'
import PermissionsPage from '../permissions/PermissionsPage'
import RolesPage from '../roles/RolesPage'

// Local mirror of backend response/request schemas for Course Builder + Courses.
// Re-exported here so the shared list / detail / modal components don't depend
// on the generated SDK (which won't include the new endpoints until
// `npm run generate-api` runs against a backend that has the new routes).

export type CategorySlug =
  | 'access-control'
  | 'permissions'
  | 'roles'

export interface CategoryDef {
  slug: CategorySlug
  label: string
  pageTitle: string
  pageDescription: string
  pageComponent: ComponentType
  icon: IconType
}

export const CATEGORIES: CategoryDef[] = [
  {
    slug: 'access-control',
    label: 'Access Control',
    pageTitle: 'Access Control',
    pageDescription: 'Select a user and assign roles to manage their permissions across the platform.',
    pageComponent: AccessControlPage,
    icon: HiOutlineUserCircle,
  },
  {
    slug: 'permissions',
    label: 'Permissions',
    pageTitle: 'Permissions',
    pageDescription: 'View all permissions defined in the system organized by module.',
    pageComponent: PermissionsPage,
    icon: HiOutlineKey,
  },
  {
    slug: 'roles',
    label: 'Roles',
    pageTitle: 'Roles',
    pageDescription: 'Create and manage roles to group and assign permissions.',
    pageComponent: RolesPage,
    icon: HiOutlineUserGroup,
  },
]
