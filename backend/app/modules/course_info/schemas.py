from __future__ import annotations

from datetime import datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

from app.core.schemas import AuditedResponse


# ─── CourseInfo header schemas ───────────────────────────────────────────────

class CourseInfoUpdate(BaseModel):
    version: int
    course_title: str | None = None


class CourseInfoResponse(AuditedResponse):
    id: int
    course_master_id: int
    course_title: str
    completion_pct: float

    model_config = ConfigDict(from_attributes=True)


class CourseInfoTabSummary(BaseModel):
    tab_no: str
    tab_name: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class CourseInfoDetailResponse(CourseInfoResponse):
    course_master_status: str
    tabs: list[CourseInfoTabSummary]
    currencies_certificate_completion: int | None = None
    flight_package_completion: int | None = None
    task_association_completion: int | None = None
    flight_pack_association_completion: int | None = None


# ─── General Information typed payload ──────────────────────────────────────

class ProgrammedWorkingHours(BaseModel):
    """Daily working schedule — frequency label plus start/end clock times."""

    frequency: str | None = None
    startTime: time | None = None
    endTime: time | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("frequency", mode="before")
    @classmethod
    def _coerce_frequency(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("startTime", "endTime", mode="before")
    @classmethod
    def _coerce_time(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            return time.fromisoformat(v)
        return v

    @field_serializer("startTime", "endTime")
    def _serialize_time(self, v: time | None) -> str | None:
        if v is None:
            return None
        return v.isoformat(timespec="minutes")


class GeneralInformationData(BaseModel):
    """Typed shape of the General Information tab.

    Each field maps 1:1 to a column on ``course_info_general``. Integer fields
    use ``int`` (with a coercion validator to accept empty strings from the
    form and turn them into ``None``).
    """

    courseTitle: str | None = None
    courseDuration: int | None = Field(default=None, ge=0)
    programmedWorkingHours: ProgrammedWorkingHours = Field(
        default_factory=ProgrammedWorkingHours
    )
    ctpVersion: str | None = None
    courseAim: str | None = None
    # Ordered list of entry-standard / pre-requisite items. Backed by the
    # ``course_info_entry_standards`` child table (one row per item).
    courseEntryStandard: list[CourseEntryStandardItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("courseDuration", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v

    @field_validator("courseEntryStandard", mode="before")
    @classmethod
    def _coerce_entry_standard(cls, v: Any) -> Any:
        # Pass through the new object-list shape untouched.
        # Silently drop legacy string-list payloads from old cached frontends
        # rather than hard-failing with a 422 mid-rollout.
        if v is None:
            return []
        if isinstance(v, list) and len(v) > 0 and isinstance(v[0], str):
            return []
        if isinstance(v, list):
            return v
        return []


class GeneralInformationTabResponse(BaseModel):
    """Read-side payload for the General Information tab."""

    status: str
    data: GeneralInformationData | None

    model_config = ConfigDict(from_attributes=True)


class GeneralInformationTabUpsert(BaseModel):
    """Write-side payload for the General Information tab."""

    status: str
    data: GeneralInformationData


# ─── Personnel Requirement typed payload ────────────────────────────────────

class PersonnelRequirementData(BaseModel):
    """Typed shape of the Personnel Requirement tab.

    Each field maps 1:1 to a column on ``course_info_personnel_requirement``.
    """

    maximumTraineesNumber: int | None = Field(default=None, ge=0)
    minimumTraineesNumber: int | None = Field(default=None, ge=0)
    instructorsToTraineesRatioFlight: str | None = None
    instructorsToTraineesRatioClassroom: str | None = None
    instructorsToTraineesRatioPractical: str | None = None
    instructorQualificationRequirements: list[InstructorQualificationRequirementItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("instructorQualificationRequirements", mode="before")
    @classmethod
    def _coerce_instructor_qualification_requirements(cls, v: Any) -> Any:
        # Pass through the new object-list shape untouched.
        # Silently drop legacy string-list payloads from old cached frontends
        # rather than hard-failing with a 422 mid-rollout.
        if v is None:
            return []
        if isinstance(v, list) and len(v) > 0 and isinstance(v[0], str):
            return []
        if isinstance(v, list):
            return v
        return []

    @field_validator("maximumTraineesNumber", "minimumTraineesNumber", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class PersonnelRequirementTabResponse(BaseModel):
    """Read-side payload for the Personnel Requirement tab."""

    status: str
    data: PersonnelRequirementData | None

    model_config = ConfigDict(from_attributes=True)


class PersonnelRequirementTabUpsert(BaseModel):
    """Write-side payload for the Personnel Requirement tab."""

    status: str
    data: PersonnelRequirementData


# ─── Resources typed payload ────────────────────────────────────────────────

class CourseEntryStandardItem(BaseModel):
    """One entry-standard / pre-requisite row — a master id (no quantity)."""

    courseEntryStandardId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("courseEntryStandardId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class InstructorQualificationRequirementItem(BaseModel):
    """One instructor qualification requirement row — a master id (no quantity)."""

    instructorQualificationRequirementId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("instructorQualificationRequirementId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class AircraftItem(BaseModel):
    """One aircraft loadout row — a type id paired with a count."""

    aircraftTypeId: int | None = None
    numberOfAircraft: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("aircraftTypeId", "numberOfAircraft", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class AircraftMissionEquipmentItem(BaseModel):
    aircraftMissionEquipmentId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("aircraftMissionEquipmentId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class AircraftArmamentItem(BaseModel):
    aircraftArmamentId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("aircraftArmamentId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class SimulatorTypeItem(BaseModel):
    simulatorTypeId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("simulatorTypeId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class MissionPlanningSystemItem(BaseModel):
    missionPlanningSystemId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("missionPlanningSystemId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class GroundMaintenanceItem(BaseModel):
    groundMaintenanceId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("groundMaintenanceId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class GroundArmamentItem(BaseModel):
    groundArmamentId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("groundArmamentId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class PersonalFlightEquipmentItem(BaseModel):
    personalFlightEquipmentId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("personalFlightEquipmentId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class AviationLifeSupportItem(BaseModel):
    aviationLifeSupportEquipmentId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("aviationLifeSupportEquipmentId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class ClassroomRequirementItem(BaseModel):
    classroomRequirementId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("classroomRequirementId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class TrainingMaterialAidItem(BaseModel):
    trainingMaterialAidId: int | None = None
    quantity: int | None = Field(default=None, ge=0)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("trainingMaterialAidId", "quantity", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class ResourcesData(BaseModel):
    """Typed shape of the Resources tab.

    ``aircraftItems`` is an ordered list of (type, count) pairs; every other
    selectable field is also an ordered list of (master_id, quantity) pairs
    backed by child tables. An id of ``None`` means the combo-box was left
    empty.
    """

    aircraftItems: list[AircraftItem] = Field(default_factory=list)
    aircraftMissionEquipmentItems: list[AircraftMissionEquipmentItem] = Field(default_factory=list)
    aircraftArmamentItems: list[AircraftArmamentItem] = Field(default_factory=list)
    groundEquipmentSimulatorTypeItems: list[SimulatorTypeItem] = Field(default_factory=list)
    groundEquipmentMissionPlanningSystemItems: list[MissionPlanningSystemItem] = Field(default_factory=list)
    groundEquipmentMaintenanceItems: list[GroundMaintenanceItem] = Field(default_factory=list)
    groundEquipmentArmamentItems: list[GroundArmamentItem] = Field(default_factory=list)
    personalFlightEquipmentItems: list[PersonalFlightEquipmentItem] = Field(default_factory=list)
    aviationLifeSupportEquipmentItems: list[AviationLifeSupportItem] = Field(default_factory=list)
    classroomRequirementItems: list[ClassroomRequirementItem] = Field(default_factory=list)
    trainingMaterialAidItems: list[TrainingMaterialAidItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ResourcesTabResponse(BaseModel):
    """Read-side payload for the Resources tab."""

    status: str
    data: ResourcesData | None

    model_config = ConfigDict(from_attributes=True)


class ResourcesTabUpsert(BaseModel):
    """Write-side payload for the Resources tab."""

    status: str
    data: ResourcesData


# ─── Lesson Planning typed payload ──────────────────────────────────────────

class TeachingPointItem(BaseModel):
    teachingPointId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("teachingPointId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class EnablingObjectiveItem(BaseModel):
    enablingObjectiveId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("enablingObjectiveId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class TrainingObjectiveItem(BaseModel):
    trainingObjectiveId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("trainingObjectiveId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class TypeOfPeriodItem(BaseModel):
    typeOfPeriodId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("typeOfPeriodId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class ClassificationOfPeriodItem(BaseModel):
    classificationOfPeriodId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("classificationOfPeriodId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class EnvironmentItem(BaseModel):
    environmentId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("environmentId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class LessonPlanningData(BaseModel):
    """Typed shape of the Lesson Planning tab.

    Integer fields use ``int``; ``typeOfPeriods``, ``classificationOfPeriods``,
    ``environments``, ``trainingObjectives``, ``enablingObjectives`` and
    ``teachingPoints`` are ordered flat lists of FK references into their
    per-field master tables.
    """

    numberOfPeriodsPerDay: int | None = Field(default=None, ge=0)
    # Half-days allowed: must be a multiple of 0.5 (e.g. 5 or 5.5), enforced below.
    numberOfTrainingDaysPerWeek: float | None = Field(default=None, ge=0)
    numberOfPeriodsPerHalfDay: int | None = Field(default=None, ge=0)
    periodDurationMinutes: int | None = Field(default=None, ge=0)
    trainingObjectives: list[TrainingObjectiveItem] = Field(default_factory=list)
    enablingObjectives: list[EnablingObjectiveItem] = Field(default_factory=list)
    teachingPoints: list[TeachingPointItem] = Field(default_factory=list)
    typeOfPeriods: list[TypeOfPeriodItem] = Field(default_factory=list)
    classificationOfPeriods: list[ClassificationOfPeriodItem] = Field(default_factory=list)
    environments: list[EnvironmentItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @field_validator(
        "numberOfPeriodsPerDay",
        "numberOfPeriodsPerHalfDay",
        "periodDurationMinutes",
        mode="before",
    )
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v

    @field_validator("numberOfTrainingDaysPerWeek", mode="before")
    @classmethod
    def _coerce_half_day(cls, v: Any) -> Any:
        """Accept blanks/None and integers; allow only whole or half days."""
        if v == "" or v is None:
            return None
        try:
            f = float(v)
        except (TypeError, ValueError) as exc:
            raise ValueError("Must be a valid number") from exc
        # Only whole or half days are allowed (e.g. 5 or 5.5, not 5.7).
        if (f * 2) % 1 != 0:
            raise ValueError("Must be a whole or half day (increments of 0.5)")
        return f


class LessonPlanningTabResponse(BaseModel):
    """Read-side payload for the Lesson Planning tab."""

    status: str
    data: LessonPlanningData | None

    model_config = ConfigDict(from_attributes=True)


class LessonPlanningTabUpsert(BaseModel):
    """Write-side payload for the Lesson Planning tab."""

    status: str
    data: LessonPlanningData


# ─── Lesson Creation typed payload ──────────────────────────────────────────

class LessonUnitItem(BaseModel):
    """One (TO, EO, TP) unit attached to a Lesson Creation lesson.

    Each field is an FK reference into its per-field master table populated
    by the Lesson Planning tab. All three combos are independent.
    """

    trainingObjectiveId: int | None = None
    enablingObjectiveId: int | None = None
    teachingPointId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator(
        "trainingObjectiveId", "enablingObjectiveId", "teachingPointId", mode="before"
    )
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v


class LessonResourceItem(BaseModel):
    """One resource attached to a lesson.

    ``category`` is the combo-box kind (e.g. ``aircraft_type``) and
    ``resourceId`` the chosen master row id within that category. Both are
    sourced from the course's Resources tab.
    """

    category: str | None = None
    resourceId: int | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("resourceId", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v

    @field_validator("category", mode="before")
    @classmethod
    def _coerce_str(cls, v: Any) -> Any:
        if v is None:
            return None
        s = str(v).strip()
        return s or None


_CONDUCT_PARTS = {"BEGINNING", "MIDDLE", "END"}


class LessonConductItem(BaseModel):
    """One conduct record attached to a lesson.

    ``part`` buckets the record into ``BEGINNING``, ``MIDDLE`` or ``END``;
    ``point``, ``material`` and ``notes`` are free text.
    """

    part: str | None = None
    point: str | None = None
    material: str | None = None
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("part", "point", "material", "notes", mode="before")
    @classmethod
    def _coerce_str(cls, v: Any) -> Any:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    @field_validator("part")
    @classmethod
    def _validate_part(cls, v: Any) -> Any:
        if v is None:
            return None
        upper = v.upper()
        if upper not in _CONDUCT_PARTS:
            raise ValueError("part must be one of BEGINNING, MIDDLE, END")
        return upper


class LessonItem(BaseModel):
    """One lesson row within the Lesson Creation tab."""

    id: int | None = None
    lessonNumber: str | None = None
    lessonTitle: str | None = None
    environmentId: int | None = None
    periodTypeId: int | None = None
    flightTiming: int | None = None
    periodPerUnit: int | None = None
    instructorStudentRatio: str | None = None
    location: str | None = None
    healthAndSafety: str | None = None
    units: list[LessonUnitItem] = Field(default_factory=list)
    resources: list[LessonResourceItem] = Field(default_factory=list)
    conducts: list[LessonConductItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @field_validator("id", "environmentId", "periodTypeId", "flightTiming", "periodPerUnit", mode="before")
    @classmethod
    def _coerce_empty_int(cls, v: Any) -> Any:
        if v == "" or v is None:
            return None
        if isinstance(v, str):
            try:
                return int(v)
            except ValueError as exc:
                raise ValueError("Must be a valid integer") from exc
        return v

    @field_validator(
        "lessonNumber", "lessonTitle", "instructorStudentRatio", "location", "healthAndSafety",
        mode="before",
    )
    @classmethod
    def _coerce_str(cls, v: Any) -> Any:
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    @field_validator("units", "resources", "conducts", mode="before")
    @classmethod
    def _coerce_list(cls, v: Any) -> Any:
        if v is None:
            return []
        return v


class LessonCreationData(BaseModel):
    """Typed shape of the Lesson Creation tab."""

    lessons: list[LessonItem] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class LessonCreationTabResponse(BaseModel):
    """Read-side payload for the Lesson Creation tab."""

    status: str
    data: LessonCreationData | None
    model_config = ConfigDict(from_attributes=True)


class LessonCreationTabUpsert(BaseModel):
    """Write-side payload for the Lesson Creation tab."""

    status: str
    data: LessonCreationData


class LessonCreationModifiedLessonsResponse(BaseModel):
    """Course Selection only: instance Lesson Creation lesson ids whose content
    has drifted from the master they were cloned from. Drives the per-lesson
    "Modified" badge in the instance's Lesson Creation list."""

    modified_lesson_ids: list[int] = Field(default_factory=list)


class LessonAssociationsResponse(BaseModel):
    """Counts of how many times a single lesson is referenced by each downstream
    category (Material, Form Builder, Evaluation, Schedule).

    Used by the Lesson Creation tab to warn before removing a lesson that other
    categories still depend on — removing it cascades those references away.
    """

    material: int = 0
    formBuilder: int = 0
    evaluation: int = 0
    schedule: int = 0
    total: int = 0

    model_config = ConfigDict(from_attributes=True)


# ─── TP Link Preview tab (derived, read-only) ───────────────────────────────

class TpLinkTeachingPoint(BaseModel):
    """A teaching point leaf in the TP Link Preview tree / unassociated list."""

    id: int
    label: str

    model_config = ConfigDict(from_attributes=True)


class TpLinkEnablingObjective(BaseModel):
    """An enabling objective grouping its associated teaching points."""

    enablingObjectiveId: int | None = None
    label: str
    teachingPoints: list[TpLinkTeachingPoint] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class TpLinkTrainingObjective(BaseModel):
    """A training objective grouping its enabling objectives."""

    trainingObjectiveId: int | None = None
    label: str
    enablingObjectives: list[TpLinkEnablingObjective] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class TpLinkPreviewData(BaseModel):
    """Read-side payload for the TP Link Preview tab.

    ``associated`` is the TO -> EO -> TP tree built from lesson units;
    ``unassociated`` lists master teaching points not yet used by any lesson.
    """

    associated: list[TpLinkTrainingObjective] = Field(default_factory=list)
    unassociated: list[TpLinkTeachingPoint] = Field(default_factory=list)
    lessonCreationComplete: bool = False

    model_config = ConfigDict(from_attributes=True)


# ─── Combo-box master option dictionaries ───────────────────────────────────

class ResourceOptionResponse(BaseModel):
    """One selectable label from a per-field master table.

    Shape is intentionally minimal — the client already knows which ``kind``
    it asked for, so the response just carries the row id and its label.
    """

    id: int
    label: str

    model_config = ConfigDict(from_attributes=True)


class LessonResourceCategoryOption(BaseModel):
    """A resource category plus the resources within it available to a lesson.

    Derived from the course's Resources tab: only categories that have at
    least one resource added there are returned, each carrying that course's
    selected resources (id + label) for the second combo box.
    """

    category: str
    categoryLabel: str
    resources: list[ResourceOptionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ResourceOptionCreate(BaseModel):
    """Payload for adding a new label to a per-field master table."""

    kind: str
    label: str
