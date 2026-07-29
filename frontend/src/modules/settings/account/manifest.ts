import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import AccountPage from './AccountPage'

const manifest: FeatureManifest = {
  i18n: 'settings.account',
  path: 'account',
  page: AccountPage,
  order: 5,
}
export default manifest
