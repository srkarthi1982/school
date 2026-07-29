import type {
  AlertTone,
  ExportReadinessItem,
  PendingActionItem,
  WeakLessonItem,
} from '../../types/dashboard';
import { Badge, StatusDot } from '../common';

type DetailListItem = WeakLessonItem | PendingActionItem | ExportReadinessItem;

type DetailListProps = {
  items: DetailListItem[];
  getPrimary: (item: DetailListItem) => string;
  getSecondary: (item: DetailListItem) => string;
  getMeta: (item: DetailListItem) => string;
  getTone?: (item: DetailListItem) => AlertTone;
  emptyText: string;
};

export function DetailList({
  emptyText,
  getMeta,
  getPrimary,
  getSecondary,
  getTone,
  items,
}: DetailListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const tone = getTone?.(item);

        return (
          <div
            className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
            key={item.id}
          >
            <div className="flex items-start justify-between gap-3">
              <strong className="text-sm font-semibold text-slate-950">
                {getPrimary(item)}
              </strong>
              {tone ? (
                <Badge tone={tone}>{getMeta(item)}</Badge>
              ) : (
                <StatusDot label={getMeta(item)} tone="info" />
              )}
            </div>
            <span className="text-sm text-slate-600">
              {getSecondary(item)}
            </span>
          </div>
        );
      })}
    </div>
  );
}


