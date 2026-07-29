import type { HTMLAttributes } from 'react';

import { cn } from '../../utils/classNames';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

type StatusDotProps = HTMLAttributes<HTMLSpanElement> & {
  label: string;
  tone?: StatusTone;
  showLabel?: boolean;
};

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
  info: 'bg-cyan-400',
};

export function StatusDot({
  className,
  label,
  showLabel = true,
  tone = 'neutral',
  ...props
}: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium text-slate-600',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('size-2.5 rounded-full shadow-sm', toneClasses[tone])}
      />
      <span className={cn(!showLabel && 'sr-only')}>{label}</span>
    </span>
  );
}


