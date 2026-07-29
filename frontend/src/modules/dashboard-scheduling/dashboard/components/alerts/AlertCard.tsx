import type { CSSProperties, ReactNode } from 'react';

import { Badge, Card } from '../common';

type AlertTone = 'success' | 'warning' | 'danger' | 'info';

type AlertCardProps = {
  title: string;
  time?: string;
  tone?: AlertTone;
  toneLabel: string;
  children?: ReactNode;
};

export function AlertCard({
  children,
  time,
  title,
  tone = 'info',
  toneLabel,
}: AlertCardProps) {
  const alertColor =
    tone === 'danger'
      ? '#f43f5e'
      : tone === 'warning'
        ? '#f59e0b'
        : tone === 'success'
          ? '#10b981'
          : '#06b6d4';

  return (
    <Card
      className="border-s-4 p-4 [border-inline-start-color:var(--alert-color)]"
      style={{ '--alert-color': alertColor } as CSSProperties}
    >
      <div className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <Badge tone={tone}>{toneLabel}</Badge>
          {time && (
            <span className="text-sm text-slate-500">{time}</span>
          )}
        </div>
        <div className="grid gap-1">
          <strong className="text-sm font-semibold text-slate-950">
            {title}
          </strong>
          {children && (
            <p className="text-sm leading-6 text-slate-600">
              {children}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}


