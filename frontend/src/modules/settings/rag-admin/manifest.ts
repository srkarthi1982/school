import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import RagAdminRoutes from './RagAdminRoutes'

// Feature under Settings. A trailing `/*` path + a <Routes> page is the
// codebase's idiom for grouping several routes behind one settings entry
// (mirrors settings/access-management). Admin-only, matching the RAG admin
// endpoints which all require `admin:full`.
const manifest: FeatureManifest = {
  i18n: 'nav.ragAdmin',
  path: 'rag-admin/*',
  page: RagAdminRoutes,
  order: 15,
  permissions: ['admin:full'],
}

export default manifest
