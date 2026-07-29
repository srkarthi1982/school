import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import GradingRoutes from './GradingRoutes'

const manifest: FeatureManifest = {
  i18n: 'nav.grading',
  path: 'grading/*',
  page: GradingRoutes,
  permissions: ["grade:*"],
  order: 70,
}
export default manifest
