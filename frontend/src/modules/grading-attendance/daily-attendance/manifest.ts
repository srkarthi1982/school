import type { FeatureManifest } from '../../../infra/shared/types/permissions';
import DailyAttendancePage from './DailyAttendancePage';
const manifest: FeatureManifest = {
    i18n: 'nav.dailyAttendance',
    path: 'daily-attendance',
    page: DailyAttendancePage,
    permissions: ["student:*", "teacher:*", "attendance:*"],
    order: 22,
}
export default manifest
