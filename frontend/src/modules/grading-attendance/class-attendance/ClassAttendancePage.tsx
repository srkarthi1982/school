import { useShallow } from 'zustand/react/shallow';
import { HiOutlineUserGroup } from 'react-icons/hi2';
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
import { useSearchParams } from 'react-router-dom';

// Helper type to ensure the permissions selector returns a Set
type PermissionsSet = Set<PermissionCode>;
export default function ClassAttendancePage() {
    const user = useAuthStore(selectUser);
    // The selector already returns a Set<PermissionCode> – no unsafe casting needed
    const permissions = useAuthStore(selectUserPermissions) as PermissionsSet;

    // Ensure we always have a numeric userId
    const userId: number = permissions.has('attendance:write')
        ? 0
        : user?.id ?? 0;

    const { onAttendanceTypeChanged, applyAttendanceContext } = useGradingAttendanceDefaultStore(
        useShallow((s) => ({
            onAttendanceTypeChanged: s.onAttendanceTypeChanged,
            applyAttendanceContext: s.applyAttendanceContext,
        }))
    );
    const { t } = useI18n();

    // Session context from the "Capture attendance" deep link (Schedule Management).
    const [searchParams] = useSearchParams();
    const ctxCourseId = searchParams.get('courseId');
    const ctxLessonId = searchParams.get('lessonId');
    const ctxDate = searchParams.get('date');
    const ctxPlacementId = searchParams.get('placementId');

    // Run once on mount. With a deep-link context, pre-fill course+lesson+date and
    // scope to the specific session (placement); otherwise plain class-attendance.
    useEffect(() => {
        (async () => {
            await onAttendanceTypeChanged('class-attendance', userId);
            if (ctxCourseId && ctxLessonId) {
                await applyAttendanceContext(
                    ctxCourseId,
                    ctxLessonId,
                    ctxDate,
                    ctxPlacementId ? Number(ctxPlacementId) : null,
                    userId,
                );
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onAttendanceTypeChanged, applyAttendanceContext, userId, ctxCourseId, ctxLessonId, ctxDate, ctxPlacementId]);

    return (
        <div className="flex flex-col h-full min-h-0 gap-4">
            <SectionHeader
                icon={<HiOutlineUserGroup />}
                eyebrow={t('common.management')}
                title={t('nav.classAttendance')}
                description={t('attendance.classDescription')}
            />
            <div className="flex-1 min-h-0">
                <Attendance user={user} userId={userId} permissions={permissions} />
            </div>
        </div>
    );
}