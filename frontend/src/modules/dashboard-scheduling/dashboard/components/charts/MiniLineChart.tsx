import type { HTMLAttributes } from 'react';

import { cn } from '../../utils/classNames';

type MiniLineChartProps = HTMLAttributes<HTMLDivElement> & {
  values: number[];
  label: string;
  height?: number;
};

function buildPath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return '';
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;

      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function MiniLineChart({
  className,
  height = 72,
  label,
  values,
  ...props
}: MiniLineChartProps) {
  const width = 240;
  const path = buildPath(values, width, height);
  // If there are no values (empty path), render only the container without SVG
  if (!path) {
    return (
      <div
        aria-label={label}
        className={cn('h-full min-h-16 w-full', className)}
        role="img"
        {...props}
      />
    );
  }

  return (
    <div
      aria-label={label}
      className={cn('h-full min-h-16 w-full', className)}
      role="img"
      {...props}
    >
      <svg
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        {/* Render the line only when a valid path exists */}
        {path && (
          <>
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              className="text-cyan-500"
            />
            <path
              d={`${path} L ${width} ${height} L 0 ${height} Z`}
              fill="currentColor"
              className="text-cyan-500/10"
            />
          </>
        )}
      </svg>
    </div>
  );
}


