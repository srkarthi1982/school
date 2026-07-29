
import type { ModuleManifest } from '../../infra/shared/types/permissions'
import CommunicationReportingIcon from './CommunicationReportingIcon'

const manifest: ModuleManifest = {
  i18n: 'nav.communicationReporting.title',
  icon: CommunicationReportingIcon,
  path: '/communication-reporting',
  permissions: ["teacher:*",'student:*'],
  order: 70,
}
export default manifest
