import type { HTMLAttributes } from 'react';

import { cn } from '../../utils/classNames';

type MiniBarChartProps = HTMLAttributes<HTMLDivElement> & {
  values: number[];
  label: string;
};

export function MiniBarChart({
  className,
  label,
  values,
  ...props
}: MiniBarChartProps) {
  const max = Math.max(...values, 1);

  return (
    <div
      aria-label={label}
      className={cn('flex h-20 items-end gap-1', className)}
      role="img"
      {...props}
    >
      {values.map((value, index) => (
        <span
          aria-hidden="true"
          className="min-h-2 flex-1 rounded-t-sm bg-cyan-500/70"
          key={`${value}-${index}`}
          style={{ height: `${Math.max((value / max) * 100, 8)}%` }}
        />
      ))}
    </div>
  );
}


