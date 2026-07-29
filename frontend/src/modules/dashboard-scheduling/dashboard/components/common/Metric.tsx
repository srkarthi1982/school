import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utils/classNames';

type MetricTone = 'neutral' | 'positive' | 'negative';

type MetricProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: ReactNode;
  helperText?: ReactNode;
  tone?: MetricTone;
};

const toneClasses: Record<MetricTone, string> = {
  neutral: 'text-slate-500',
  positive: 'text-emerald-600',
  negative: 'text-rose-600',
};

export function Metric({
  className,
  helperText,
  label,
  tone = 'neutral',
  value,
  ...props
}: MetricProps) {
  return (
    <div className={cn('grid gap-1', className)} {...props}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <strong className="text-3xl font-semibold leading-none text-slate-950">
        {value}
      </strong>
      {helperText && <span className={cn('text-sm', toneClasses[tone])}>{helperText}</span>}
    </div>
  );
}


