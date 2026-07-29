import type { FeatureManifest } from '../../../infra/shared/types/permissions';
import ClassAttendancePage from './ClassAttendancePage';
const manifest: FeatureManifest = {
    i18n: 'nav.classAttendance',
    path: 'class-attendance',
    page: ClassAttendancePage,
    permissions: ["student:*", "teacher:*", "attendance:*"],
    order: 21,
}
export default manifest
