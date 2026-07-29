import type { ReactNode } from 'react';

import { MiniBarChart, MiniLineChart } from '../charts';
import { Card, Metric, StatusDot } from '../common';

type TrendCardVariant = 'line' | 'bar';

type TrendCardProps = {
  label: string;
  value: ReactNode;
  helperText?: ReactNode;
  values: number[];
  variant?: TrendCardVariant;
  statusLabel?: string;
};

export function TrendCard({
  helperText,
  label,
  value,
  values,
  variant = 'line',
  statusLabel,
}: TrendCardProps) {
  return (
    <Card className="grid gap-5">
      <div className="flex items-start justify-between gap-3">
        <Metric helperText={helperText} label={label} value={value} />
        {statusLabel && <StatusDot label={statusLabel} tone="success" />}
      </div>
      {variant === 'bar' ? (
        <MiniBarChart label={String(label)} values={values} />
      ) : (
        <MiniLineChart className="h-16" label={String(label)} values={values} />
      )}
    </Card>
  );
}


