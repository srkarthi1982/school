import type { FeatureManifest } from '../../../infra/shared/types/permissions'
import VirtualClassroomListPage from './VirtualClassroomListPage'

// Lives as a feature inside Communication & Reporting rather than a
// top-level module. The desktop submenu and mobile tabs both pick it
// up automatically; routes register at /communication-reporting/virtual-classroom.
const manifest: FeatureManifest = {
  i18n: 'nav.communicationReporting.virtualClassroom',
  path: 'virtual-classroom',
  page: VirtualClassroomListPage,
  permissions: ['class_session:*'],
  order: 40,
}
export default manifest
