import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '../../../infra/locales/I18nContext';
import { useDashboardStore, PermissionsSet } from './store';
import SectionHeader from '../../../infra/shared/components/SectionHeader';
import { HiOutlinePresentationChartLine } from 'react-icons/hi2';
import useAuthStore, { selectUserPermissions } from '../../../infra/auth/useAuthStore';
import DashboardView from './components/DashboardView';
export default function DashboardPage() {
  const permissions = useAuthStore(selectUserPermissions) as PermissionsSet
  const { filters, getDashboardInfo } = useDashboardStore(
    useShallow((s) => ({
      filters: s.filters,
      getDashboardInfo: s.getDashboardInfo
    }))
  );
  const { t } = useI18n();
  const report_type = permissions.has('dashboard:leadership') ? t('dashboard.leadership') :
    permissions.has('dashboard:sat') ? t('dashboard.sat') :
      permissions.has('dashboard:instructor') ? t('dashboard.instructor') : t('dashboard.student');

  useEffect(() => {
    const init = async () => {
      if (permissions) {
        await getDashboardInfo({ ...filters, report_type: report_type.toLocaleLowerCase() });
      }
    };
    init();
  }, [permissions, getDashboardInfo]);
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto grid gap-5">
        {/* Header */}
        <SectionHeader icon={<HiOutlinePresentationChartLine />} title={`${report_type} ${t('nav.dashboard')}`} />
        {/* Dashboard View */}
        <DashboardView />
      </div>
    </main>
  );
}