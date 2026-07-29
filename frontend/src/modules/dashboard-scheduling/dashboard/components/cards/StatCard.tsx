import type { ReactNode } from 'react';

import { Card, Metric, StatusDot } from '../common';

type StatCardProps = {
  label: string;
  value: ReactNode;
  helperText?: ReactNode;
  statusLabel?: string;
};

export function StatCard({ helperText, label, value, statusLabel }: StatCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <Metric helperText={helperText} label={label} value={value} />
        {statusLabel && <StatusDot label={statusLabel} tone="success" />}
      </div>
    </Card>
  );
}


