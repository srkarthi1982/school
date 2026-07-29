import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import NotificationBadgeIcon from './components/NotificationBadge'
import NotificationPage from './NotificationPage'

const manifest: FeatureManifest = {
  i18n: 'nav.communicationReporting.notification',
  path: 'notification',
  order: 10,
  page: NotificationPage,
  badge: NotificationBadgeIcon
}

export default manifest
