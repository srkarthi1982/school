import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import AircraftViewerPage from './AircraftViewerPage'

const featureManifest: FeatureManifest = {
  i18n: 'nav.courseManagement.aircraftViewer.title',
  path: 'aircraft-viewer',
  page: AircraftViewerPage,
  permissions: ['course:*'],
  order: 50,
}

export default featureManifest
