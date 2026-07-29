import type { ReactNode } from 'react';

import { Panel } from '../common';
import { cn } from '../../utils/classNames';

type AlertPanelProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AlertPanel({ actions, children, className, title }: AlertPanelProps) {
  return (
    <Panel actions={actions} className={cn('h-full', className)} title={title}>
      <div className="grid gap-3">{children}</div>
    </Panel>
  );
}


