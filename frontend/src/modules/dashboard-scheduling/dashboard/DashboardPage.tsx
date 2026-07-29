import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '../../../infra/locales/I18nContext';
import { DashboardKey, useDashboardStore, PermissionsSet } from './store';
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
  const reportType: DashboardKey = permissions.has('dashboard:leadership') ? 'leadership' :
    permissions.has('dashboard:sat') ? 'sat' :
      permissions.has('dashboard:instructor') ? 'instructor' : 'student';
  const reportLabel = t(`dashboard.${reportType}`);

  useEffect(() => {
    void getDashboardInfo({ ...filters, report_type: reportType });
  }, [getDashboardInfo, reportType]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950 sm:px-6">
      <div className="mx-auto grid gap-5">
        {/* Header */}
        <SectionHeader icon={<HiOutlinePresentationChartLine />} title={`${reportLabel} ${t('nav.dashboard')}`} />
        {/* Dashboard View */}
        <DashboardView />
      </div>
    </main>
  );
}
