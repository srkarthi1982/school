import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import FaqPage from './FaqPage'

// Read access is gated by `faq:read` (held by every role). Write actions are
// gated inside the page using `faq:write`.
const manifest: FeatureManifest = {
  i18n: 'nav.communicationReport.faq.title',
  path: 'faq',
  page: FaqPage,
  order: 25,
  permissions: ['faq:read'],
}

export default manifest
