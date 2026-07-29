import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utils/classNames';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  tone?: BadgeTone;
};

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    'border-slate-300 bg-slate-100 text-slate-700',
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-700',
  warning:
    'border-amber-300 bg-amber-50 text-amber-700',
  danger:
    'border-rose-300 bg-rose-50 text-rose-700',
  info: 'border-cyan-300 bg-cyan-50 text-cyan-700',
};

export function Badge({ children, className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold uppercase leading-none tracking-wide',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}


