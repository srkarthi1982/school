import type { HTMLAttributes } from 'react';

import { cn } from '../../utils/classNames';
import { StatusDot } from '../common';

type ProgressCircleProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: number;
  max?: number;
  suffix?: string;
  statusLabel?: string;
};

export function ProgressCircle({
  className,
  label,
  max = 100,
  suffix = '%',
  value,
  statusLabel,
  ...props
}: ProgressCircleProps) {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percentage = max > 0 ? clampedValue / max : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - circumference * percentage;

  return (
    <div
      aria-label={`${label}: ${clampedValue}${suffix}`}
      className={cn('relative size-32', className)}
      role="img"
      {...props}
    >
      <svg className="size-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-slate-200"
          cx="50"
          cy="50"
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeWidth="10"
        />
        <circle
          className="text-cyan-500"
          cx="50"
          cy="50"
          fill="none"
          r={radius}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth="10"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <span>
          <strong className="block text-2xl font-semibold text-slate-950">
            {clampedValue}
            {suffix}
          </strong>
          <span className="text-xs text-slate-500">{label}</span>
        </span>
      </div>
    </div>
  );
}


