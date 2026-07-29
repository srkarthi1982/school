import type { ReactNode } from 'react';

import { cn } from '../../utils/classNames';

type MainGridProps = {
  children: ReactNode;
  className?: string;
};

export function MainGrid({ children, className }: MainGridProps) {
  return (
    <div className={cn('grid gap-4 lg:grid-cols-3 xl:gap-5', className)}>{children}</div>
  );
}


