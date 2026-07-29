import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utils/classNames';

type SectionTitleProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

export function SectionTitle({
  actions,
  className,
  description,
  title,
  ...props
}: SectionTitleProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)} {...props}>
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}


