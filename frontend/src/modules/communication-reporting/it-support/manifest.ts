import { FeatureManifest } from '../../../infra/shared/types/permissions'
import ItSupportPage from './ItSupportPage'

const featureManifest: FeatureManifest = {
  i18n: 'nav.communicationReport.itSupport.title',
  page: ItSupportPage,
  path: 'it-support',
  order: 17,
  // Visible to requesters, IT staff, and approvers. Admin matches via admin:full.
  permissions: ['ticket:create', 'ticket:respond', 'ticket:view_all'],
}

export default featureManifest
