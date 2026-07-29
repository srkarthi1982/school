import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utils/classNames';

type PanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
};

export function Panel({ children, className, title, actions, ...props }: PanelProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-slate-200 bg-slate-50/80 p-4 transition-colors sm:p-5',
        className,
      )}
      {...props}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}


