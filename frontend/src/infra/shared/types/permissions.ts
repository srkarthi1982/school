import type { ComponentType } from 'react'
import type { IconType } from 'react-icons'
import {ValidTranslationKeys} from "../../locales/I18nContext.tsx";
import type { PermissionCode } from './permissions.gen'

export type { PermissionCode }


/**
 * Permission pattern accepted by manifest gating. Forms:
 *   - exact `PermissionCode`               e.g. 'user:read'
 *   - prefix wildcard `'<prefix>:*'`        e.g. 'chat:*' matches chat:read, chat:write…
 *   - global wildcard `'*'`                 matches anything (public-with-auth)
 *
 * Typed as `PermissionCode | (string & {})` — TypeScript autocomplete suggests
 * concrete `PermissionCode` literals while still accepting any string for
 * wildcard patterns or future codes not yet generated.
 */
export type PermissionPattern = PermissionCode | (string & {})

// Access requirement attached to a menu item / route. `permissions` lists one
// or more patterns; user passes if ANY pattern matches ANY of their
// permissions. Empty/absent = public.
export type AccessRequirement = {
  permissions?: PermissionPattern[]
}

export type SubMenuItem = {
  i18n?: ValidTranslationKeys
  path: string
  page: ComponentType
  permissions?: PermissionPattern[]
  badge?: IconType
}

export type MenuItem = {
  i18n?: ValidTranslationKeys
  icon?: IconType
  path?: string
  page?: ComponentType
  permissions?: PermissionPattern[]
  children?: SubMenuItem[]
  pinBottom?: true
}

export type ModuleManifest = {
  i18n: ValidTranslationKeys
  icon: IconType
  path: string
  page?: ComponentType
  permissions?: PermissionPattern[]
  pinBottom?: true
  order?: number
}

export type FeatureManifest = {
  i18n: ValidTranslationKeys
  path: string
  page: ComponentType
  permissions?: PermissionPattern[]
  order?: number
  badge?: IconType
}
