import type { MenuItem, ModuleManifest, FeatureManifest } from '../shared/types/permissions'

// Auto-discover module & feature manifests from src/modules/.
//
// Convention:
//   src/modules/<module>/manifest.ts              → module manifest (path absolute)
//   src/modules/<module>/<feature>/manifest.ts    → feature manifest (path relative)
//
// Display order is controlled by the `order` (number) field in each manifest.
// Lower `order` first; manifests without `order` go last. Tie-breaker is the
// folder name alphabetically, so the result is deterministic.
//
// A module manifest with `page` renders that page at its path; without `page`,
// the module redirects to the first accessible feature when visited directly.
//
// Manifests are picked up automatically by Vite's import.meta.glob — no
// registration step. Drop in a new `manifest.ts` and it appears.

type ModuleModule  = { default: ModuleManifest }
type FeatureModule = { default: FeatureManifest }

const moduleGlob = import.meta.glob<ModuleModule>('../../modules/*/manifest.ts', {
  eager: true,
})
const featureGlob = import.meta.glob<FeatureModule>('../../modules/*/*/manifest.ts', {
  eager: true,
})

const moduleRegex  = /\/modules\/([^/]+)\/manifest\.ts$/
const featureRegex = /\/modules\/([^/]+)\/([^/]+)\/manifest\.ts$/

type Bucket = {
  moduleFolder: string
  module:       ModuleManifest | null
  features:     Array<{ folder: string; manifest: FeatureManifest }>
}

const buckets = new Map<string, Bucket>()
const ensure = (folder: string): Bucket => {
  let b = buckets.get(folder)
  if (!b) {
    b = { moduleFolder: folder, module: null, features: [] }
    buckets.set(folder, b)
  }
  return b
}

for (const [filePath, mod] of Object.entries(moduleGlob)) {
  const m = filePath.match(moduleRegex)
  if (!m || !mod.default) continue
  ensure(m[1]).module = mod.default
}

for (const [filePath, mod] of Object.entries(featureGlob)) {
  const m = filePath.match(featureRegex)
  if (!m || !mod.default) continue
  ensure(m[1]).features.push({ folder: m[2], manifest: mod.default })
}

const orderOf = (n: number | undefined) => n ?? Number.POSITIVE_INFINITY

const compareByOrder = <T extends { order?: number }>(
  a: { order: number; folder: string; manifest: T },
  b: { order: number; folder: string; manifest: T },
) => (a.order - b.order) || a.folder.localeCompare(b.folder)

const sortedModules = Array.from(buckets.values())
  .filter(b => b.module)
  .map(b => ({ order: orderOf(b.module!.order), folder: b.moduleFolder, bucket: b }))
  .sort((a, b) => (a.order - b.order) || a.folder.localeCompare(b.folder))

export const MENU_CONFIG: MenuItem[] = sortedModules.map(({ bucket: b }) => {
  const features = b.features
    .map(f => ({ order: orderOf(f.manifest.order), folder: f.folder, manifest: f.manifest }))
    .sort(compareByOrder)
    .map(({ manifest }) => ({
      i18n: manifest.i18n,
      path: manifest.path,
      page: manifest.page,
      permissions: manifest.permissions,
      badge: manifest.badge
    }))

  return {
    i18n:        b.module!.i18n,
    icon:        b.module!.icon,
    path:        b.module!.path,
    page:        b.module!.page,
    permissions: b.module!.permissions,
    pinBottom:   b.module!.pinBottom,
    children:    features.length ? features : undefined,
  } as MenuItem
})
