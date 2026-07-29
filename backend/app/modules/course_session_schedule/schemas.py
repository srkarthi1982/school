from __future__ import annotations

from pydantic import Field

# Reuse the selection schedule's table-agnostic shapes for everything EXCEPT the
# placement (the session schedule stores free-form time, not period columns).
from app.modules.course_selection_schedule.schemas import (
    LessonUnitUpsert,
    ScheduleCalendar,
    ScheduleConfig,
    ScheduleLessonItem,
    _CamelModel,
)

# Minimum block length the API will accept (minutes). A 0/negative duration is
# coerced up to this so a block is always visible/grabbable.
MIN_DURATION_MINUTE = 5


class SessionPlacementItem(_CamelModel):
    """One placed lesson block, free-form. ``start_minute`` is minutes-from-midnight
    within the owning day row's date; ``duration_minute`` is the block length."""

    id: int | None = None
    lesson_id: int
    start_minute: int
    duration_minute: int
    description: str | None = None
    remarks: str | None = None


class SessionPlacementUpsert(_CamelModel):
    """One placement inside a full-schedule PUT."""

    lesson_id: int
    start_minute: int = 0
    duration_minute: int = Field(default=MIN_DURATION_MINUTE, ge=1)
    description: str | None = None
    remarks: str | None = None


class SessionPlacementMove(_CamelModel):
    """Move/resize ONE placement (Schedule Management drag/resize)."""

    day_index: int
    start_minute: int = 0
    duration_minute: int = Field(default=MIN_DURATION_MINUTE, ge=1)


class SessionPlacementAdd(_CamelModel):
    """Add ONE new lesson placement at a free-form time."""

    lesson_id: int
    day_index: int
    start_minute: int = 0
    duration_minute: int = Field(default=MIN_DURATION_MINUTE, ge=1)


class SessionScheduleDayItem(_CamelModel):
    id: int | None = None
    # Labels are computed on the client; echoed for parity.
    day_label: str | None = None
    # Real per-day date (ISO) — the display source of truth for session schedules.
    date: str | None = None
    items: list[SessionPlacementItem] = Field(default_factory=list)


class SessionScheduleDetailResponse(_CamelModel):
    id: int
    course_instance_id: int
    course_title: str | None = None
    course_date: str | None = None
    status: str
    # False when the course isn't approved yet / no session schedule exists.
    available: bool = True
    config: ScheduleConfig
    calendar: ScheduleCalendar
    lessons: list[ScheduleLessonItem]
    days: list[SessionScheduleDayItem]
    # Operational-edit metadata for the re-approval keep/reset prompt.
    last_modified_by_name: str | None = None
    last_modified_at: str | None = None


class SessionScheduleDayUpsert(_CamelModel):
    day_label: str | None = None
    date: str | None = None
    items: list[SessionPlacementUpsert] = Field(default_factory=list)


class SessionScheduleUpsert(_CamelModel):
    status: str = "created"
    days: list[SessionScheduleDayUpsert] = Field(default_factory=list)
    lesson_units: list[LessonUnitUpsert] = Field(default_factory=list)
    calendar: ScheduleCalendar | None = None


class DayDateUpdate(_CamelModel):
    """Edit a single day row's real date (ISO yyyy-mm-dd, or null to clear)."""

    date: str | None = None


class SessionScheduleMeta(_CamelModel):
    """Lightweight state for the approve flow's keep/reset prompt."""

    exists: bool = False
    available: bool = False
    touched: bool = False
    last_modified_by_name: str | None = None
    last_modified_at: str | None = None


__all__ = [
    "ScheduleCalendar",
    "ScheduleConfig",
    "ScheduleLessonItem",
    "SessionPlacementItem",
    "SessionPlacementUpsert",
    "SessionPlacementMove",
    "SessionPlacementAdd",
    "SessionScheduleDayItem",
    "SessionScheduleDetailResponse",
    "SessionScheduleDayUpsert",
    "SessionScheduleUpsert",
    "DayDateUpdate",
    "SessionScheduleMeta",
]
