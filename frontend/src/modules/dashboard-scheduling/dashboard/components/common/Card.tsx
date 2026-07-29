import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utils/classNames';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 sm:p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}


