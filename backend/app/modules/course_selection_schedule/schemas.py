from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


def _camel(s: str) -> str:
    head, *tail = s.split("_")
    return head + "".join(w.capitalize() for w in tail)


class _CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=_camel)


# ─── Read-only grid config, derived from the instance's Course Information ───

class ScheduleConfig(_CamelModel):
    periods_per_day: int
    total_training_days: int
    training_days_per_week: float
    periods_per_half_day: int
    period_duration_minutes: int
    # Wall-clock time the first period of each day starts at ("HH:MM"), from the
    # instance's programmed working hours (fallback "08:00"). Used by viewers to
    # place each block on a real time slot: start = day_start + start_col*period.
    day_start_time: str = "08:00"


# ─── Calendar (real dates), set by the "Generate dates" action ──────────────

class ScheduleCalendar(_CamelModel):
    """Calendar settings used to label day rows with real dates.

    ``start_date`` is the first training day (ISO date). ``off_weekdays`` lists
    the weekday numbers that are days off (Mon=0 … Sun=6). ``holidays`` lists
    specific ISO dates to skip. The client computes each day row's date by
    walking forward from ``start_date`` over the available (non-off, non-holiday)
    days. Null/empty ``start_date`` means "no dates yet" → "Day N" labels.
    """

    start_date: str | None = None
    off_weekdays: list[int] = Field(default_factory=list)
    holidays: list[str] = Field(default_factory=list)


# ─── Lesson catalogue (read-only, sourced from the instance Lesson Creation) ─

class ScheduleLessonItem(_CamelModel):
    id: int
    lesson_number: str | None = None
    lesson_title: str | None = None
    environment_label: str | None = None
    period_type_label: str | None = None
    # TOTAL periods of the lesson (= flight timing); sum across all its blocks.
    periods: int = 1
    # Size of ONE block unit when placed on the grid (clamped to fit a day).
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
    # Labels are computed on the client from the calendar; echoed for parity.
    day_label: str | None = None
    items: list[SchedulePlacementItem] = Field(default_factory=list)


class ScheduleDetailResponse(_CamelModel):
    id: int
    course_instance_id: int
    course_title: str | None = None
    course_date: str | None = None
    status: str
    config: ScheduleConfig
    calendar: ScheduleCalendar
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
    # Accepted for parity with the master payload; the instance computes labels
    # from the calendar, so this is ignored on write.
    day_label: str | None = None
    items: list[SchedulePlacementUpsert] = Field(default_factory=list)


class LessonUnitUpsert(_CamelModel):
    """A lesson's block-unit size edited from the schedule grid.

    Resizing a block writes its new span back to the INSTANCE lesson's
    ``period_per_unit``. Only resized lessons are sent; the lesson total
    (flight timing) is recomputed on the server from the persisted blocks.
    """

    lesson_id: int
    period_per_unit: int = Field(ge=1)


class ScheduleUpsert(_CamelModel):
    status: str = "created"
    days: list[ScheduleDayUpsert] = Field(default_factory=list)
    lesson_units: list[LessonUnitUpsert] = Field(default_factory=list)
    # Calendar settings from "Generate dates"; persisted on the schedule hub.
    calendar: ScheduleCalendar | None = None


class PlacementMoveUpsert(_CamelModel):
    """Move/resize a single existing placement (Schedule Management teacher edit).

    The block is relocated to the day row at ``day_index`` and positioned at
    ``start_col`` for ``span`` columns (clamped server-side to the day's usable
    columns). No create/delete — only an existing placement is repositioned.
    """

    day_index: int = Field(ge=0)
    start_col: int = Field(ge=0)
    span: int = Field(ge=1)


# ─── Lesson Detail (read-only, full page in Schedule Management) ─────────────
#
# One membership-gated payload that gathers everything shown on the lesson
# detail page: the lesson's own info (labels resolved) plus the quizzes, forms,
# surveys and materials attached to it. Students and instructors both read it;
# `role` lets the page tailor copy without a second permission call.

class LessonUnitDetail(_CamelModel):
    training_objective: str | None = None
    enabling_objective: str | None = None
    teaching_point: str | None = None


class LessonResourceDetail(_CamelModel):
    label: str | None = None
    category: str | None = None
    category_label: str | None = None


class LessonConductDetail(_CamelModel):
    part: str | None = None
    point: str | None = None
    material: str | None = None
    notes: str | None = None


class LessonGeneralDetail(_CamelModel):
    id: int
    lesson_number: str | None = None
    lesson_title: str | None = None
    environment_label: str | None = None
    period_type_label: str | None = None
    total_periods: int = 1
    period_per_unit: int = 1
    instructor_student_ratio: str | None = None
    location: str | None = None
    health_and_safety: str | None = None
    units: list[LessonUnitDetail] = Field(default_factory=list)
    resources: list[LessonResourceDetail] = Field(default_factory=list)
    conducts: list[LessonConductDetail] = Field(default_factory=list)


class _Releasable(_CamelModel):
    # Per-lesson lifecycle (Schedule Management). For a STUDENT viewer, ``released``
    # means the teacher sent this item to them specifically. For a TEACHER viewer it
    # means the item is sent to at least one student; ``released_student_ids`` then
    # lists exactly which enrolled students it's sent to and ``completed_student_ids``
    # those who've already taken it (and therefore can't be unsent). Both id lists
    # are populated for teachers only — a student never sees the roster's state.
    released: bool = False
    completed_by_me: bool = False
    released_student_ids: list[int] = Field(default_factory=list)
    completed_student_ids: list[int] = Field(default_factory=list)


class LessonContentQuiz(_Releasable):
    id: int  # association id
    quiz_id: int
    name: str
    description: str | None = None
    type: str | None = None
    question_count: int = 0
    assessment_type: str | None = None
    max_mark: float = 0
    pass_mark: float = 0
    pass_percentage: float = 0


class LessonContentForm(_Releasable):
    id: int  # association/link id
    form_id: int
    title: str
    description: str | None = None
    status: str | None = None
    question_count: int = 0


class LessonContentSurvey(_Releasable):
    id: int  # link id
    survey_id: int
    title: str
    description: str | None = None
    status: str | None = None
    question_count: int = 0


class LessonContentMaterial(_CamelModel):
    id: str  # file UUID
    filename: str
    content_type: str | None = None
    file_size: int = 0
    download_url: str | None = None
    library_material_id: int | None = None


class LessonFlightPackContent(_CamelModel):
    """A flight-pack association that includes this lesson."""
    id: int  # association id
    package_id: int
    package_name: str
    task_count: int


class MaterialProgressUpsert(_CamelModel):
    """Reading-progress update from the lesson material reader. Accepts snake or
    camel keys (pages_read/pagesRead)."""

    pages_read: int | None = None
    total_pages: int | None = None


class MaterialProgressRead(_CamelModel):
    file_id: str
    pages_read: int = 0
    total_pages: int = 0
    completed: bool = False


class LessonTrackStudent(_CamelModel):
    student_id: int
    full_name: str
    rank: str | None = None
    completed: bool = False
    completed_at: str | None = None
    completed_by: str | None = None
    # Only populated for student viewers: whether they've marked this lesson done.
    completed_by_me: bool = False


class ScheduleLessonDetailResponse(_CamelModel):
    course_instance_id: int
    course_title: str | None = None
    # True when the viewer is an instructor of this course (or admin): drives the
    # "send to students" teacher view. Membership-based, not role-name-based.
    can_manage: bool = False
    lesson: LessonGeneralDetail
    quizzes: list[LessonContentQuiz] = Field(default_factory=list)
    evaluation_forms: list[LessonContentForm] = Field(default_factory=list)
    surveys: list[LessonContentSurvey] = Field(default_factory=list)
    forms: list[LessonContentForm] = Field(default_factory=list)
    materials: list[LessonContentMaterial] = Field(default_factory=list)
    flight_packs: list[LessonFlightPackContent] = Field(default_factory=list)
    enrolled_students: list[LessonTrackStudent] = Field(default_factory=list)


# ─── Release / completion (teacher sends to students; student marks taken) ───

class LessonContentRef(_CamelModel):
    """Identifies one content item of a lesson for release/completion.

    ``content_type`` is 'quiz' | 'form' | 'survey'; ``content_id`` is the
    underlying quiz/form/survey id (not the lesson-association row id).
    """

    content_type: str
    content_id: int


class LessonReleaseTargets(_CamelModel):
    """Set exactly which students a quiz/form/survey is released to for a lesson.

    ``student_ids`` is the full desired recipient set (profile ids). The server
    reconciles: it releases to any newly-listed student and revokes from any
    omitted one — except students who've already taken it, who always stay
    released (they can't be unsent). An empty list therefore unsends everyone who
    hasn't taken it yet. "Send to all" is just every enrolled student's id.
    """

    content_type: str
    content_id: int
    student_ids: list[int] = Field(default_factory=list)


class LessonTrackUpsert(_CamelModel):
    """Toggle a student's lesson completion."""

    completed: bool = True
