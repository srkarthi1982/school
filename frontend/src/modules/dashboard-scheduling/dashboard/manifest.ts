import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import DashboardPage from './DashboardPage'

const manifest: FeatureManifest = {
  i18n: 'nav.dashboard',
  path: 'dashboard',
  page: DashboardPage,
  permissions: ['dashboard:*'],
  order: 40,
}
export default manifest