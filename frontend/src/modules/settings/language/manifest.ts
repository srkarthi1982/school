import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import LanguagePage from './LanguagePage'

const manifest: FeatureManifest = {
  i18n: 'settings.language',
  path: 'language',
  page: LanguagePage,
  order: 30,
}
export default manifest
