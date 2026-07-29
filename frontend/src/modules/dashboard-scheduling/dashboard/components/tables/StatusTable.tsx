import type { AlertTone, RiskStatusItem } from '../../types/dashboard';
import { cn } from '../../utils/classNames';
import { Badge } from '../common';

type StatusTableProps = {
  rows: RiskStatusItem[];
  emptyText: string;
  headers: {
    area: string;
    owner: string;
    status: string;
    nextStep: string;
  };
};

const riskToneClasses: Record<AlertTone, string> = {
  danger: 'text-rose-600',
  warning: 'text-amber-600',
  success: 'text-emerald-600',
  info: 'text-cyan-600',
};

export function StatusTable({ emptyText, headers, rows }: StatusTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-start text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-3 pe-4 font-semibold">{headers.area}</th>
            <th className="pb-3 pe-4 font-semibold">{headers.owner}</th>
            <th className="pb-3 pe-4 font-semibold">{headers.status}</th>
            <th className="pb-3 pe-4 font-semibold">{headers.nextStep}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr
              className="transition-colors hover:bg-slate-100/70"
              key={row.id}
            >
              <td className="py-3 pe-4 font-medium text-slate-950">
                {row.area}
              </td>
              <td className="py-3 pe-4 text-slate-600">
                {row.owner}
              </td>
              <td className="py-3 pe-4">
                <Badge tone={row.riskLevel}>{row.status}</Badge>
              </td>
              <td className={cn('py-3 pe-4', riskToneClasses[row.riskLevel])}>
                {row.nextStep}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


