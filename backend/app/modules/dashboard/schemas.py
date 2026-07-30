from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator
from typing import List, Literal, Optional


class DashboardSummaryResponse(BaseModel):
    total_users: int
    total_courses: int
    total_attendance_records: int

    class Config:
        from_attributes = True


# ----------------------------------------------------------------------
# Types mirroring the frontend store (store.ts)
# ----------------------------------------------------------------------

class FilterOption(BaseModel):
    label: str
    value: str

class DashboardFilterConfig(BaseModel):
    label: str
    key: str  # corresponds to keyof DashboardFilterState
    options: List[FilterOption]


class DashboardFilterState(BaseModel):
    report_type: Literal["leadership", "sat", "instructor", "student"] = "leadership"
    course: str = "all"
    courseVersion: str = "all"
    courseInstance: str = "all"
    student: str = "all"
    instructor: str = "all"
    dateRange: str = "24h"
    lesson: str = "all"
    trainingType: str = "all"
    competency: str = "all"
    aircraftSimulator: str = "all"
    material: str = "all"
    evaluationType: str = "all"

    @field_validator(
        "courseInstance",
        "student",
        "instructor",
        "lesson",
    )
    @classmethod
    def validate_numeric_filter(cls, value: str) -> str:
        if value == "all":
            return value
        if not value.isdecimal() or int(value) < 1:
            raise ValueError("must be 'all' or a positive integer ID")
        return value

    @field_validator("course")
    @classmethod
    def validate_course_filter(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must be 'all' or a non-empty course title")
        return value

    @field_validator("dateRange")
    @classmethod
    def validate_date_range(cls, value: str) -> str:
        if value not in {"all", "24h", "7d", "30d"}:
            raise ValueError("must be one of: all, 24h, 7d, 30d")
        return value

    @field_validator("material")
    @classmethod
    def validate_material(cls, value: str) -> str:
        if value != "all":
            try:
                UUID(value)
            except ValueError as exc:
                raise ValueError("must be 'all' or a valid UUID") from exc
        return value


class AlertItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    code: str
    title: str
    description: Optional[str] = None
    severity: Literal["info", "warning", "high", "critical"]
    dashboardRole: str
    entityType: str
    entityIdentifier: str
    course: Optional[str] = None
    courseVersion: Optional[str] = None
    courseInstance: Optional[str] = None
    student: Optional[str] = None
    instructor: Optional[str] = None
    lesson: Optional[str] = None
    currentValue: Optional[str] = None
    threshold: Optional[str] = None
    generatedTimestamp: str
    recommendedAction: Optional[str] = None
    time: str
    tone: str  # 'success' | 'warning' | 'danger' | 'info'


class Item(BaseModel):
    model_config = ConfigDict(extra="forbid")
    helperText: str
    label: str
    statusLabel: str
    values: List[int]
    value: str


class KpiCategorySummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    label: str
    value: str
    helperText: str
    tone: str


class CoverageMetric(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    label: str
    value: str
    helperText: str
    tone: str


class CoverageSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    items: List[CoverageMetric]


class RiskStatusItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    area: str
    owner: str
    status: str
    riskLevel: str  # AlertTone
    nextStep: str


class WeakLessonItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    lesson: str
    cohort: str
    score: str
    trend: str


class PendingActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    owner: str
    due: str
    tone: str  # AlertTone


class ExportReadinessItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    label: str
    value: str
    status: str  # AlertTone


class DashboardDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kpiCategories: List[KpiCategorySummary]
    riskStatuses: List[RiskStatusItem]
    weakLessons: List[WeakLessonItem]
    pendingActions: List[PendingActionItem]
    exportReadiness: List[ExportReadinessItem]
    coverageSections: List[CoverageSection]


class DashboardInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    card1: Item
    card2: Item
    card3: Item
    card4: Item
    strip1: Item
    strip2: Item
    strip3: Item
    alerts: List[AlertItem]
    details: DashboardDetails


class DashboardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filterOptions: List[DashboardFilterConfig]
    dashboardInfo: DashboardInfo
    filters: DashboardFilterState
