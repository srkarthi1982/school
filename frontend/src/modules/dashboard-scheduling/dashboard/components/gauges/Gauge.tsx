import type { HTMLAttributes } from 'react';

import { cn } from '../../utils/classNames';
import { StatusDot } from '../common';

type GaugeProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: number;
  max?: number;
  suffix?: string;
  statusLabel?: string;
};

export function Gauge({
  className,
  label,
  max = 100,
  suffix = '%',
  value,
  statusLabel,
  ...props
}: GaugeProps) {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percentage = max > 0 ? clampedValue / max : 0;
  const dashArray = 126;
  const dashOffset = dashArray - dashArray * percentage;

  return (
    <div
      aria-label={`${label}: ${clampedValue}${suffix}`}
      className={cn('grid justify-items-center gap-2 relative', className)}
      role="img"
      {...props}
    >
      <div className="relative h-32 w-48">
        <svg className="h-full w-full" viewBox="0 0 160 104">
          <path
            className="text-slate-200"
            d="M 24 88 A 56 56 0 0 1 136 88"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="14"
          />
          <path
            className="text-emerald-500"
            d="M 24 88 A 56 56 0 0 1 136 88"
            fill="none"
            stroke="currentColor"
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth="14"
          />
        </svg>
        <div className="absolute inset-x-0 bottom-2 grid justify-items-center">
          <strong className="text-3xl font-semibold text-slate-950">
            {clampedValue}
            {suffix}
          </strong>
          <span className="text-sm text-slate-500">{label}</span>
        </div>
        {statusLabel && <StatusDot label={statusLabel} tone="success" className="absolute top-0 right-0" />}
      </div>
    </div>
  );
}


