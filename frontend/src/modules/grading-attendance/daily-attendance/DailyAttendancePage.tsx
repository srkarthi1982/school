import { useShallow } from 'zustand/react/shallow';
import { HiOutlineClipboardDocumentCheck } from 'react-icons/hi2';
import useAuthStore, {
    selectUser,
    selectUserPermissions,
} from '../../../infra/auth/useAuthStore';
import type { PermissionCode } from '../../../infra/shared/types/permissions';
import Attendance from '../components/Attendance';
import useGradingAttendanceDefaultStore from '../store';
import { useI18n } from '../../../infra/locales/I18nContext';
import SectionHeader from '../../../infra/shared/components/SectionHeader';
import { useEffect } from 'react';

// Helper type to ensure the permissions selector returns a Set
type PermissionsSet = Set<PermissionCode>;

export default function DailyAttendancePage() {
    const user = useAuthStore(selectUser);
    // The selector already returns a Set<PermissionCode> – no unsafe casting needed
    const permissions = useAuthStore(selectUserPermissions) as PermissionsSet;

    // Ensure we always have a numeric userId
    const userId: number = permissions.has('attendance:write')
        ? 0
        : user?.id ?? 0;

    const { onAttendanceTypeChanged } = useGradingAttendanceDefaultStore(
        useShallow((s) => ({
            onAttendanceTypeChanged: s.onAttendanceTypeChanged,
        }))
    );
    const { t } = useI18n();

    // Run once on mount
    useEffect(() => {
        onAttendanceTypeChanged('daily-attendance', userId);
    }, [onAttendanceTypeChanged, userId]);

    return (
        <div className="flex flex-col h-full min-h-0 gap-4">
            <SectionHeader
                icon={<HiOutlineClipboardDocumentCheck />}
                eyebrow={t('common.management')}
                title={t('nav.dailyAttendance')}
                description={t('attendance.dailyDescription')}
            />
            <div className="flex-1 min-h-0">
                <Attendance user={user} userId={userId} permissions={permissions} />
            </div>
        </div>
    );
}
