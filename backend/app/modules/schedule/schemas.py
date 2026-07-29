from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


def _camel(s: str) -> str:
    head, *tail = s.split("_")
    return head + "".join(w.capitalize() for w in tail)


class _CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=_camel)


# ─── Read-only grid config, derived from Course Information ──────────────────

class ScheduleConfig(_CamelModel):
    periods_per_day: int
    total_training_days: int
    # Fractional (e.g. 4.5) when the week ends with a half day.
    training_days_per_week: float
    # Period capacity of a half day (the last day of each week when fractional).
    periods_per_half_day: int
    period_duration_minutes: int


# ─── Lesson catalogue (read-only, sourced from Lesson Creation) ─────────────

class ScheduleLessonItem(_CamelModel):
    id: int
    lesson_number: str | None = None
    lesson_title: str | None = None
    environment_label: str | None = None
    period_type_label: str | None = None
    # Total periods of the lesson (= flight timing). This is the SUM across all
    # of the lesson's blocks; it is not the block size and may exceed a day.
    periods: int = 1
    # Size of ONE block unit when the lesson is placed on the grid (clamped to
    # fit a day). Falls back to flight timing when unset in Lesson Creation.
    period_per_unit: int = 1


# ─── Placements / days ──────────────────────────────────────────────────────

class SchedulePlacementItem(_CamelModel):
    id: int | None = None
    lesson_id: int
    start_col: int = Field(ge=0)
    span: int = Field(ge=1)
    description: str | None = None
    remarks: str | None = None


class ScheduleDayItem(_CamelModel):
    id: int | None = None
    day_label: str
    items: list[SchedulePlacementItem] = Field(default_factory=list)


class ScheduleDetailResponse(_CamelModel):
    id: int
    course_master_id: int
    course_title: str | None = None
    course_date: str | None = None
    status: str
    config: ScheduleConfig
    lessons: list[ScheduleLessonItem]
    days: list[ScheduleDayItem]


# ─── Write payload ──────────────────────────────────────────────────────────

class SchedulePlacementUpsert(_CamelModel):
    lesson_id: int
    start_col: int = Field(ge=0)
    span: int = Field(ge=1)
    description: str | None = None
    remarks: str | None = None


class ScheduleDayUpsert(_CamelModel):
    day_label: str
    items: list[SchedulePlacementUpsert] = Field(default_factory=list)


class LessonUnitUpsert(_CamelModel):
    """A lesson's block-unit size edited from the schedule grid.

    Resizing a block writes its new span back to the lesson's ``period_per_unit``
    in Lesson Creation (the default block size for future placements). Only
    resized lessons are sent. The lesson's TOTAL (flight timing) is NOT sent —
    it is recomputed on the server from the spans of every persisted block.
    """

    lesson_id: int
    period_per_unit: int = Field(ge=1)


class ScheduleUpsert(_CamelModel):
    status: str = "created"
    days: list[ScheduleDayUpsert] = Field(default_factory=list)
    lesson_units: list[LessonUnitUpsert] = Field(default_factory=list)
