export type DashboardTheme = 'light' | 'dark';

export type DashboardKey = 'leadership' | 'sat' | 'instructor' | 'student';

export type AlertTone = 'success' | 'warning' | 'danger' | 'info';

export type DashboardLanguage = 'en' | 'ar';

export type DashboardDirection = 'ltr' | 'rtl';

export type DashboardFilterState = {
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
  region: string;
  serviceType: string;
  status: string;
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

type KpiMetric = {
  id: string;
  label: string;
  value: string;
  helperText?: string;
  statusLabel?: string;
  trendValues?: number[];
};

type TrendMetric = {
  id: string;
  label: string;
  value: string;
  helperText?: string;
  values: number[];
  variant: 'line' | 'bar';
};

export type AlertItem = {
  id: string;
  title: string;
  description?: string;
  time: string;
  tone: AlertTone;
};

type CourseKpis = {
  activeCourses: KpiMetric;
  completionRate: KpiMetric;
  atRiskCourses: KpiMetric;
};

type StudentKpis = {
  activeStudents: KpiMetric;
  attendanceRate: KpiMetric;
  retentionRisk: KpiMetric;
};

type InstructorKpis = {
  activeInstructors: KpiMetric;
  averageLoad: KpiMetric;
  responseTime: KpiMetric;
};

type LessonKpis = {
  lessonsDelivered: KpiMetric;
  lessonCompletion: KpiMetric;
  rescheduleRate: KpiMetric;
};

type MaterialKpis = {
  materialsPublished: KpiMetric;
  usageRate: KpiMetric;
  reviewBacklog: KpiMetric;
};

type EvaluationKpis = {
  evaluationsCompleted: KpiMetric;
  averageScore: KpiMetric;
  pendingReviews: KpiMetric;
};

type SimulatorKpis = {
  sessionsCompleted: KpiMetric;
  passRate: KpiMetric;
  retryRate: KpiMetric;
};

type ApiExportKpis = {
  exportJobs: KpiMetric;
  apiLatency: KpiMetric;
  syncSuccessRate: KpiMetric;
};

type KpiCategorySummary = {
  id: string;
  label: string;
  value: string;
  helperText: string;
  tone: AlertTone;
};

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

export type DashboardData = {
  summary: KpiMetric[];
  trends: TrendMetric[];
  courses: CourseKpis;
  students: StudentKpis;
  instructors: InstructorKpis;
  lessons: LessonKpis;
  materials: MaterialKpis;
  evaluations: EvaluationKpis;
  simulators: SimulatorKpis;
  apiExports: ApiExportKpis;
  details: DashboardDetails;
};
