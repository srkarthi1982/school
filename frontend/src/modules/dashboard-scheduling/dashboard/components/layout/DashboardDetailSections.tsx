import type {
  DashboardDetails,
  ExportReadinessItem,
  PendingActionItem,
  WeakLessonItem,
} from '../../types/dashboard';
import { useI18n } from "../../../../../infra/locales/I18nContext";
import { Badge, Card, Metric, Panel } from '../common';
import { DetailList, StatusTable } from '../tables';

type DashboardDetailSectionsProps = {
  details: DashboardDetails;
};

export function DashboardDetailSections({details}: DashboardDetailSectionsProps) {
  const { t } = useI18n();
  return (
    <div className="grid gap-5">
      <Panel title={t('dashboard.detailSections.kpiSummary')}>
        {details.kpiCategories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            {t('dashboard.detailSections.empty.kpiCategories')}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {details.kpiCategories.map((category) => (
              <Card className="grid gap-3 p-4" key={category.id}>
                <div className="flex items-start justify-between gap-3">
                  <Metric
                    helperText={category.helperText}
                    label={category.label}
                    value={category.value}
                  />
                  <Badge tone={category.tone}>
                    {t(`common.toneLabels.${category.tone}`)}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Panel>

      {details.coverageSections.map((section) => (
        <Panel key={section.id} title={section.title}>
          {section.items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              {t('dashboard.detailSections.empty.coverage')}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {section.items.map((item) => (
                <Card className="grid gap-3 p-4" key={item.id}>
                  <Metric
                    helperText={item.helperText}
                    label={item.label}
                    value={item.value}
                  />
                  <Badge tone={item.tone}>
                    {t(`common.toneLabels.${item.tone}`)}
                  </Badge>
                </Card>
              ))}
            </div>
          )}
        </Panel>
      ))}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title={t('dashboard.detailSections.riskTable')}>
          <StatusTable
            emptyText={t('dashboard.detailSections.empty.riskStatuses')}
            headers={{
              area: t('dashboard.detailSections.tableHeaders.area'),
              owner: t('dashboard.detailSections.tableHeaders.owner'),
              status: t('dashboard.detailSections.tableHeaders.status'),
              nextStep: t('dashboard.detailSections.tableHeaders.nextStep')
            }}
            rows={details.riskStatuses}
          />
        </Panel>

        <Panel title={t('dashboard.detailSections.exportReadiness')}>
          <DetailList
            emptyText={t('dashboard.detailSections.empty.exportReadiness')}
            getMeta={(item) => (item as ExportReadinessItem).value}
            getPrimary={(item) => (item as ExportReadinessItem).label}
            getSecondary={(item) =>
              `${t('common.statusPrefix')}: ${
                t(`common.toneLabels.${(item as ExportReadinessItem).status}`)
              }`
            }
            getTone={(item) => (item as ExportReadinessItem).status}
            items={details.exportReadiness}
          />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t('dashboard.detailSections.weakLessons')}>
          <DetailList
            emptyText={t('dashboard.detailSections.empty.weakLessons')}
            getMeta={(item) => (item as WeakLessonItem).score}
            getPrimary={(item) => (item as WeakLessonItem).lesson}
            getSecondary={(item) =>
              `${(item as WeakLessonItem).cohort} | ${t('common.trendPrefix')} ${
                (item as WeakLessonItem).trend
              }`
            }
            items={details.weakLessons}
          />
        </Panel>

        <Panel title={t('dashboard.detailSections.pendingActions')}>
          <DetailList
            emptyText={t('dashboard.detailSections.empty.pendingActions')}
            getMeta={(item) => (item as PendingActionItem).due}
            getPrimary={(item) => (item as PendingActionItem).title}
            getSecondary={(item) =>
              `${t('common.ownerPrefix')}: ${(item as PendingActionItem).owner}`
            }
            getTone={(item) => (item as PendingActionItem).tone}
            items={details.pendingActions}
          />
        </Panel>
      </div>
    </div>
  );
}


