import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import ProgressTrackerPage from './ProgressTrackerPage'

const manifest: FeatureManifest = {
  i18n: 'nav.progressTracker',
  path: 'progress-tracker',
  page: ProgressTrackerPage,
  permissions: ['progress_tracker:*'],
  order: 40,
}
export default manifest
