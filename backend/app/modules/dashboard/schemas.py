from uuid import UUID

from pydantic import BaseModel, field_validator
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
        "course",
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
    id: str
    title: str
    description: Optional[str] = None
    time: str
    tone: str  # 'success' | 'warning' | 'danger' | 'info'


class Item(BaseModel):
    helperText: str
    label: str
    statusLabel: str
    values: List[int]
    value: str


class KpiCategorySummary(BaseModel):
    id: str
    label: str
    value: str
    helperText: str
    tone: str


class CoverageMetric(BaseModel):
    id: str
    label: str
    value: str
    helperText: str
    tone: str


class CoverageSection(BaseModel):
    id: str
    title: str
    items: List[CoverageMetric]


class RiskStatusItem(BaseModel):
    id: str
    area: str
    owner: str
    status: str
    riskLevel: str  # AlertTone
    nextStep: str


class WeakLessonItem(BaseModel):
    id: str
    lesson: str
    cohort: str
    score: str
    trend: str


class PendingActionItem(BaseModel):
    id: str
    title: str
    owner: str
    due: str
    tone: str  # AlertTone


class ExportReadinessItem(BaseModel):
    id: str
    label: str
    value: str
    status: str  # AlertTone


class DashboardDetails(BaseModel):
    kpiCategories: List[KpiCategorySummary]
    riskStatuses: List[RiskStatusItem]
    weakLessons: List[WeakLessonItem]
    pendingActions: List[PendingActionItem]
    exportReadiness: List[ExportReadinessItem]
    coverageSections: List[CoverageSection]


class DashboardInfo(BaseModel):
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
    filterOptions: List[DashboardFilterConfig]
    dashboardInfo: DashboardInfo
    filters: DashboardFilterState
