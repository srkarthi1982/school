import { HiOutlineChartBarSquare } from 'react-icons/hi2'
import type { ModuleManifest } from '../../infra/shared/types/permissions'


const manifest: ModuleManifest = {
  i18n: 'nav.gradingAttendance',
  icon: HiOutlineChartBarSquare,
  path: '/grading-attendance',
  permissions: ["student:*", "teacher:*", "attendance:*"],
  order: 60,
}
export default manifest
