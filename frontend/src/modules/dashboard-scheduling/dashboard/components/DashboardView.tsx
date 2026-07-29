import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "../store";
import { Button } from "./common";
import { FilterBar } from "./FilterBar";
import { MainGrid } from "./layout/MainGrid";
import { KpiCard, StatCard, TrendCard } from "./cards";
import { Gauge, ProgressCircle } from "./gauges";
import { AlertCard, AlertPanel } from "./alerts";
import { DashboardDetailSections } from "./layout/DashboardDetailSections";

export function toNumber(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''));

  return Number.isFinite(parsed) ? parsed : 0;
}
const toneLabels: Record<string, string> = {
  success: 'Success',
  warning: 'Warning',
  danger: 'Critical',
  info: 'Info',
};
export default function DashboardView() {
  const { resetFilters, setFilters, filterOptions, filters, dashboardInfo, loading, error } = useDashboardStore(
    useShallow((s) => ({
      resetFilters: s.resetFilters,
      setFilters: s.setFilters,
      filterOptions: s.filterOptions,
      filters: s.filters,
      dashboardInfo: s.dashboardInfo,
      loading: s.loading,
      error: s.error,
    }))
  );
  return (
    <div className="grid gap-5">
      {error && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          {error}
        </div>
      )}
      <FilterBar
        actions={
          <Button disabled={loading} onClick={resetFilters} variant="ghost">Reset</Button>
        }
        disabled={loading}
        filters={filterOptions.map((filter) => ({
          label: filter.label,
          options: filter.options,
          value: filters[filter.key as keyof typeof filters],
          onChange: (value) => setFilters({ [filter.key]: value }),
        }))}
      />
      {loading && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600" role="status">
          Loading dashboard data…
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="grid gap-5">
          <MainGrid className="lg:grid-cols-2">
            <KpiCard
              helperText={dashboardInfo?.card1?.helperText}
              label={dashboardInfo?.card1?.label}
              statusLabel={dashboardInfo?.card1?.statusLabel}
              trendValues={dashboardInfo?.card1?.values}
              value={dashboardInfo?.card1?.value}
            />
            <TrendCard
              helperText={dashboardInfo?.card2?.helperText || ''}
              label={dashboardInfo?.card2?.label}
              statusLabel={dashboardInfo?.card2?.statusLabel}
              value={dashboardInfo?.card2?.value}
              values={dashboardInfo?.card2?.values}
              variant={'bar'}
            />
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <Gauge
                label={dashboardInfo?.card3?.label}
                statusLabel={dashboardInfo?.card3?.statusLabel}
                value={toNumber(dashboardInfo?.card3?.value)}
              />
            </div>
            <KpiCard
              helperText={dashboardInfo?.card4?.helperText}
              label={dashboardInfo?.card4?.label}
              statusLabel={dashboardInfo?.card4?.statusLabel}
              trendValues={dashboardInfo?.card4?.values}
              value={dashboardInfo?.card4?.value}
            />
          </MainGrid>
          <MainGrid>
            <StatCard
              label={dashboardInfo.strip1.label}
              value={dashboardInfo.strip1.value}
              statusLabel={dashboardInfo?.strip1?.statusLabel}
            />
            <StatCard
              label={dashboardInfo.strip2.label}
              value={dashboardInfo.strip2.value}
              statusLabel={dashboardInfo?.strip2?.statusLabel}
            />
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <ProgressCircle
                label={dashboardInfo.strip3.label}
                value={toNumber(dashboardInfo.strip3.value)}
                statusLabel={dashboardInfo?.strip3?.statusLabel}
              />
            </div>
          </MainGrid>
        </div>
        <AlertPanel className="xl:sticky xl:top-5" title={'Dashboard Alerts'}>
          {dashboardInfo.alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              toneLabel={toneLabels[alert.tone as string]}
              time={alert.time}
              title={alert.title}
              tone={alert.tone as any}
            >
              {alert.description}
            </AlertCard>
          ))}
          {dashboardInfo.alerts.length === 0 &&
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              No Dashboard alerts
            </div>
          }
        </AlertPanel>
      </div>
      <DashboardDetailSections details={dashboardInfo.details as any} />
    </div>
  );
}

