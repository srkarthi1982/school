from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.core.schemas import AuditedResponse

# The typed tab payload schemas are owner-agnostic — reuse them verbatim from
# the master Course Information module so both sides stay in lock-step.
from app.modules.course_info.schemas import (  # noqa: F401  (re-exported)
    CourseInfoTabSummary,
    GeneralInformationData,
    GeneralInformationTabResponse,
    GeneralInformationTabUpsert,
    LessonCreationData,
    LessonCreationTabResponse,
    LessonCreationTabUpsert,
    LessonPlanningData,
    LessonPlanningTabResponse,
    LessonPlanningTabUpsert,
    LessonResourceCategoryOption,
    PersonnelRequirementData,
    PersonnelRequirementTabResponse,
    PersonnelRequirementTabUpsert,
    ResourceOptionCreate,
    ResourceOptionResponse,
    ResourcesData,
    ResourcesTabResponse,
    ResourcesTabUpsert,
    TpLinkPreviewData,
)


class CourseSelectionInfoResponse(AuditedResponse):
    """Header detail for an instance's Course Information category."""

    id: int
    course_instance_id: int
    course_title: str
    completion_pct: float

    model_config = ConfigDict(from_attributes=True)


class CourseSelectionInfoDetailResponse(CourseSelectionInfoResponse):
    course_status: str
    tabs: list[CourseInfoTabSummary]


class CourseSelectionInfoUpdate(BaseModel):
    """Title-only update for the instance Course Information header.

    Unlike the master, a course instance has no optimistic-lock ``version``.
    """

    course_title: str | None = None
