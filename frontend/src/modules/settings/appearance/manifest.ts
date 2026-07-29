import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import AppearancePage from './AppearancePage'

const manifest: FeatureManifest = {
  i18n: 'settings.appearance',
  path: 'appearance',
  page: AppearancePage,
  order: 25,
}
export default manifest
