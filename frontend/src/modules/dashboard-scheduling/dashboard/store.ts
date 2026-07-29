import { create } from 'zustand';
import type { PermissionCode } from '../../../infra/shared/types/permissions';
import * as api from '../../../api/generated';
import type { DashboardResponse } from '../../../api/generated';

export type DashboardKey = 'leadership' | 'sat' | 'instructor' | 'student';
export type PermissionsSet = Set<PermissionCode>;
export type DashboardFilterState = {
    report_type: string;
    course: string;
    courseVersion: string;
    courseInstance: string;
    student: string;
    instructor: string;
    dateRange: string;
    lesson: string;
    trainingType: string;
    competency: string;
    aircraftSimulator: string;
    material: string;
    evaluationType: string;
};
export type AlertTone = 'success' | 'warning' | 'danger' | 'info';
export type AlertItem = {
    id: string;
    title: string;
    description?: string;
    time: string;
    tone: AlertTone;
};
type FilterOption = {
    label: string;
    value: string;
};
export type DashboardFilterConfig = {
    label: string;
    key: keyof DashboardFilterState;
    options: FilterOption[];
};
type KpiCategorySummary = {
    id: string;
    label: string;
    value: string;
    helperText: string;
    tone: AlertTone;
};
type Item = {
    helperText: string;
    label: string;
    statusLabel: string;
    values: number[];
    value: string;
}
export type DashboardInfo = DashboardResponse['dashboardInfo'];
export type CoverageMetric = KpiCategorySummary;
export type CoverageSection = {
    id: string;
    title: string;
    items: CoverageMetric[];
};

export type RiskStatusItem = {
    id: string;
    area: string;
    owner: string;
    status: string;
    riskLevel: AlertTone;
    nextStep: string;
};

export type WeakLessonItem = {
    id: string;
    lesson: string;
    cohort: string;
    score: string;
    trend: string;
};

export type PendingActionItem = {
    id: string;
    title: string;
    owner: string;
    due: string;
    tone: AlertTone;
};

export type ExportReadinessItem = {
    id: string;
    label: string;
    value: string;
    status: AlertTone;
};
export type DashboardDetails = {
    kpiCategories: KpiCategorySummary[];
    riskStatuses: RiskStatusItem[];
    weakLessons: WeakLessonItem[];
    pendingActions: PendingActionItem[];
    exportReadiness: ExportReadinessItem[];
    coverageSections: CoverageSection[];
};
type DashboardStore = {
    filters: DashboardFilterState;
    filterOptions: DashboardResponse["filterOptions"];
    dashboardInfo: DashboardInfo;
    getDashboardInfo: (parameters: Partial<DashboardFilterState>) => Promise<void>;    
    resetFilters: () => void;
    setFilters: (filters: Partial<DashboardFilterState>) => void;
};
export const defaultDashboardFilters: DashboardFilterState = {
    report_type: 'leadership',
    course: 'all',
    courseVersion: 'all',
    courseInstance: 'all',
    student: 'all',
    instructor: 'all',
    dateRange: '24h',
    lesson: 'all',
    trainingType: 'all',
    competency: 'all',
    aircraftSimulator: 'all',
    material: 'all',
    evaluationType: 'all'
};
export const useDashboardStore = create<DashboardStore>((set, get) => ({
    activeDashboard: 'leadership',
    filters: defaultDashboardFilters,
    filterOptions: [] as any,
    dashboardInfo: {
        card1: {
            helperText: '',
            label: '',
            statusLabel: '',
            values: [] as number[],
            value: '',
        },
        card2: {
            helperText: '',
            label: '',
            statusLabel: '',
            values: [] as number[],
            value: '',
        },
        card3: {
            helperText: '',
            label: '',
            statusLabel: '',
            values: [] as number[],
            value: '',
        },
        card4: {
            helperText: '',
            label: '',
            statusLabel: '',
            values: [] as number[],
            value: '',
        },
        strip1: {
            helperText: '',
            label: '',
            statusLabel: '',
            values: [] as number[],
            value: '',
        },
        strip2: {
            helperText: '',
            label: '',
            statusLabel: '',
            values: [] as number[],
            value: '',
        },
        strip3: {
            helperText: '',
            label: '',
            statusLabel: '',
            values: [] as number[],
            value: '',
        },
        alerts: [] as AlertItem[],
        details: {
            kpiCategories: [] as KpiCategorySummary[],
            riskStatuses: [] as RiskStatusItem[],
            weakLessons: [] as WeakLessonItem[],
            pendingActions: [] as PendingActionItem[],
            exportReadiness: [] as ExportReadinessItem[],
            coverageSections: [] as CoverageSection[],
        },
    } as DashboardInfo,
    getDashboardInfo: async (parameters) => {
        const response = (await api.getInfoApiV1DashboardInfoGet({ query: parameters })).data;
        if (response) {
            const { dashboardInfo, filterOptions, filters } = response;
            const mergedFilters = { ...defaultDashboardFilters, ...filters };
            set({ dashboardInfo, filterOptions, filters: mergedFilters });
        }
    },    
    setFilters: (filter) => {
        const { filters, getDashboardInfo } = get();
        set(state => ({ filters: { ...state.filters, ...filter } }));
        getDashboardInfo({ ...filters, ...filter });
    },
    resetFilters: () => {
        const { getDashboardInfo } = get();
        set({ filters: defaultDashboardFilters })
        getDashboardInfo(defaultDashboardFilters);
    }    
}));
