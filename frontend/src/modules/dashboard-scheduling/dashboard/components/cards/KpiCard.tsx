import type { ReactNode } from 'react';

import { MiniLineChart } from '../charts';
import { Card, Metric, StatusDot } from '../common';

type KpiCardProps = {
  label: string;
  value: ReactNode;
  helperText?: ReactNode;
  statusLabel?: string;
  trendValues?: number[];
};

export function KpiCard({
  helperText,
  label,
  statusLabel,
  trendValues,
  value,
}: KpiCardProps) {
  return (
    <Card className="grid gap-5">
      <div className="flex items-start justify-between gap-3">
        <Metric helperText={helperText} label={label} tone="positive" value={value} />
        {statusLabel && <StatusDot label={statusLabel} tone="success" />}
      </div>
      {trendValues && (
        <MiniLineChart
          className="h-16"
          label={String(label)}
          values={trendValues}
        />
      )}
    </Card>
  );
}


