from __future__ import annotations

from datetime import datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import AuditedMixin, Base, TimestampMixin

if TYPE_CHECKING:
    from app.modules.course_master.models import CourseMaster


class CourseInfoGeneralInformation(AuditedMixin, Base):
    """Typed storage for the General Information tab.

    One row per CourseMaster. Each form field is its own column with its real
    SQL type — strings/text as ``String``/``Text``, counts as ``Integer`` —
    so the data is queryable and validated at the schema layer.

    The tab's ``status`` (``incomplete`` / ``draft`` / ``complete``) lives on
    this row, mirroring the per-section pattern used in eForms.
    """

    __tablename__ = "course_info_general"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    course_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    programmed_working_frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)
    programmed_working_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    programmed_working_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    course_aim: Mapped[str | None] = mapped_column(Text, nullable=True)

    course_master: Mapped["CourseMaster"] = relationship(back_populates="general")
    entry_standards: Mapped[list["CourseInfoEntryStandard"]] = relationship(
        back_populates="general",
        cascade="all, delete-orphan",
        order_by="CourseInfoEntryStandard.order_index",
    )


class CourseInfoEntryStandard(Base):
    """One entry standard / pre-requisite item for the General Information tab.

    Stored as a child row of ``course_info_general``.  Each row points at a
    ``master_course_entry_standards`` row by FK so the value is reusable across
    courses and managed via the ComboBox picklist.
    """

    __tablename__ = "course_info_entry_standards"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_general_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_general.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    course_entry_standard_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_course_entry_standards.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    general: Mapped["CourseInfoGeneralInformation"] = relationship(
        back_populates="entry_standards"
    )
    course_entry_standard: Mapped["MasterCourseEntryStandard | None"] = relationship()


class CourseInfoInstructorQualificationRequirement(Base):
    """One instructor qualification requirement item for the Personnel Requirement tab.

    Stored as a child row of ``course_info_personnel_requirement``.  Each row
    points at a ``master_instructor_qualification_requirements`` row by FK so
    the value is reusable across courses and managed via the ComboBox picklist.
    """

    __tablename__ = "course_info_instructor_qualification_requirements"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_personnel_requirement_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_personnel_requirement.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    instructor_qualification_requirement_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_instructor_qualification_requirements.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    personnel_requirement: Mapped["CourseInfoPersonnelRequirement"] = relationship(
        back_populates="instructor_qualification_requirements"
    )
    instructor_qualification_requirement: Mapped["MasterInstructorQualificationRequirement | None"] = relationship()


class CourseInfoPersonnelRequirement(AuditedMixin, Base):
    """Typed storage for the Personnel Requirement tab.

    One row per CourseMaster. Trainee counts are stored as integers; instructor
    ratios are free-form strings (e.g. ``"1:5"``) and qualification
    requirements are stored as an ordered list of child rows.
    """

    __tablename__ = "course_info_personnel_requirement"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    maximum_trainees_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    minimum_trainees_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    instructors_to_trainees_ratio_flight: Mapped[str | None] = mapped_column(String(100), nullable=True)
    instructors_to_trainees_ratio_classroom: Mapped[str | None] = mapped_column(String(100), nullable=True)
    instructors_to_trainees_ratio_practical: Mapped[str | None] = mapped_column(String(100), nullable=True)

    course_master: Mapped["CourseMaster"] = relationship(back_populates="personnel_requirement")
    instructor_qualification_requirements: Mapped[list["CourseInfoInstructorQualificationRequirement"]] = relationship(
        back_populates="personnel_requirement",
        cascade="all, delete-orphan",
        order_by="CourseInfoInstructorQualificationRequirement.order_index",
    )


# ─── Per-field master tables (combo-box dictionaries) ───────────────────────
#
# Each combo-box on the Resources and Lesson Planning tabs is backed by its
# own master table. New labels typed by a user via the "select or add" combo
# box are inserted into the master table for that field so future selections
# show them as suggestions. The owning tab row points at the chosen master
# row by FK (true one-to-many) — renaming a master row therefore changes how
# the value appears on historical course rows, and deleting a master row
# nulls the FK via ``ON DELETE SET NULL``.

class _MasterMixin(TimestampMixin):
    """Common shape for the per-field combo-box master tables.

    ``label`` is unique within a single table — two rows in
    ``master_aircraft_types`` can't share a label, but different master
    tables can independently use the same string.
    """

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class MasterAircraftType(_MasterMixin, Base):
    __tablename__ = "master_aircraft_types"


class MasterAircraftMissionEquipment(_MasterMixin, Base):
    __tablename__ = "master_aircraft_mission_equipment"


class MasterAircraftArmament(_MasterMixin, Base):
    __tablename__ = "master_aircraft_armaments"


class MasterSimulatorType(_MasterMixin, Base):
    __tablename__ = "master_simulator_types"


class MasterCourseEntryStandard(_MasterMixin, Base):
    __tablename__ = "master_course_entry_standards"


class MasterMissionPlanningSystem(_MasterMixin, Base):
    __tablename__ = "master_mission_planning_systems"


class MasterGroundMaintenanceEquipment(_MasterMixin, Base):
    __tablename__ = "master_ground_maintenance_equipment"


class MasterGroundArmament(_MasterMixin, Base):
    __tablename__ = "master_ground_armaments"


class MasterPersonalFlightEquipment(_MasterMixin, Base):
    __tablename__ = "master_personal_flight_equipment"


class MasterAviationLifeSupportEquipment(_MasterMixin, Base):
    __tablename__ = "master_aviation_life_support_equipment"


class MasterClassroomRequirement(_MasterMixin, Base):
    __tablename__ = "master_classroom_requirements"


class MasterTrainingMaterialAid(_MasterMixin, Base):
    __tablename__ = "master_training_material_aids"


class MasterPeriodType(_MasterMixin, Base):
    __tablename__ = "master_period_types"


class MasterPeriodClassification(_MasterMixin, Base):
    __tablename__ = "master_period_classifications"


class MasterEnvironment(_MasterMixin, Base):
    __tablename__ = "master_environments"


class MasterTrainingObjective(_MasterMixin, Base):
    __tablename__ = "master_training_objectives"


class MasterEnablingObjective(_MasterMixin, Base):
    __tablename__ = "master_enabling_objectives"


class MasterTeachingPoint(_MasterMixin, Base):
    __tablename__ = "master_teaching_points"


class MasterInstructorQualificationRequirement(_MasterMixin, Base):
    __tablename__ = "master_instructor_qualification_requirements"


# ─── Tab tables that reference the master tables by FK ──────────────────────

class CourseInfoResources(AuditedMixin, Base):
    """Typed storage for the Resources tab.

    One row per CourseMaster. ``number_of_aircraft`` is integer; every other
    selectable value is a FK to a per-field master table. ``ON DELETE SET
    NULL`` is used on each FK so deleting a master row orphans the reference
    rather than removing the resources row.
    """

    __tablename__ = "course_info_resources"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    course_master: Mapped["CourseMaster"] = relationship(back_populates="resources")
    aircraft_items: Mapped[list["CourseInfoResourcesAircraftItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesAircraftItem.order_index",
    )
    aircraft_mission_equipment_items: Mapped[list["CourseInfoResourcesAircraftMissionEquipmentItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesAircraftMissionEquipmentItem.order_index",
    )
    aircraft_armament_items: Mapped[list["CourseInfoResourcesAircraftArmamentItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesAircraftArmamentItem.order_index",
    )
    ground_equipment_simulator_type_items: Mapped[list["CourseInfoResourcesSimulatorTypeItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesSimulatorTypeItem.order_index",
    )
    ground_equipment_mission_planning_system_items: Mapped[list["CourseInfoResourcesMissionPlanningSystemItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesMissionPlanningSystemItem.order_index",
    )
    ground_equipment_maintenance_items: Mapped[list["CourseInfoResourcesGroundMaintenanceItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesGroundMaintenanceItem.order_index",
    )
    ground_equipment_armament_items: Mapped[list["CourseInfoResourcesGroundArmamentItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesGroundArmamentItem.order_index",
    )
    personal_flight_equipment_items: Mapped[list["CourseInfoResourcesPersonalFlightEquipmentItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesPersonalFlightEquipmentItem.order_index",
    )
    aviation_life_support_equipment_items: Mapped[list["CourseInfoResourcesAviationLifeSupportItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesAviationLifeSupportItem.order_index",
    )
    classroom_requirement_items: Mapped[list["CourseInfoResourcesClassroomRequirementItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesClassroomRequirementItem.order_index",
    )
    training_material_aid_items: Mapped[list["CourseInfoResourcesTrainingMaterialAidItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseInfoResourcesTrainingMaterialAidItem.order_index",
    )


class CourseInfoResourcesAircraftItem(Base):
    """One aircraft-loadout row for the Resources tab.

    Stored as a child row of ``course_info_resources`` so a course can declare
    several aircraft type / count pairs (e.g. ``4 UH-60M`` + ``2 Spare UH-60M``)
    instead of a single type/count. ``aircraft_type_id`` references
    ``master_aircraft_types`` with ``ON DELETE SET NULL`` so deleting a master
    row orphans the reference rather than the item.
    """

    __tablename__ = "course_info_resources_aircraft_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aircraft_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_aircraft_types.id", ondelete="SET NULL"), nullable=True
    )
    number_of_aircraft: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="aircraft_items")
    aircraft_type: Mapped["MasterAircraftType | None"] = relationship()


class CourseInfoResourcesAircraftMissionEquipmentItem(Base):
    __tablename__ = "course_info_resources_aircraft_mission_equipment_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aircraft_mission_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_aircraft_mission_equipment.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="aircraft_mission_equipment_items")
    aircraft_mission_equipment: Mapped["MasterAircraftMissionEquipment | None"] = relationship()


class CourseInfoResourcesAircraftArmamentItem(Base):
    __tablename__ = "course_info_resources_aircraft_armament_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aircraft_armament_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_aircraft_armaments.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="aircraft_armament_items")
    aircraft_armament: Mapped["MasterAircraftArmament | None"] = relationship()


class CourseInfoResourcesSimulatorTypeItem(Base):
    __tablename__ = "course_info_resources_simulator_type_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    simulator_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_simulator_types.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="ground_equipment_simulator_type_items")
    simulator_type: Mapped["MasterSimulatorType | None"] = relationship()


class CourseInfoResourcesMissionPlanningSystemItem(Base):
    __tablename__ = "course_info_resources_mission_planning_system_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mission_planning_system_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_mission_planning_systems.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="ground_equipment_mission_planning_system_items")
    mission_planning_system: Mapped["MasterMissionPlanningSystem | None"] = relationship()


class CourseInfoResourcesGroundMaintenanceItem(Base):
    __tablename__ = "course_info_resources_ground_maintenance_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ground_maintenance_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_ground_maintenance_equipment.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="ground_equipment_maintenance_items")
    ground_maintenance_equipment: Mapped["MasterGroundMaintenanceEquipment | None"] = relationship()


class CourseInfoResourcesGroundArmamentItem(Base):
    __tablename__ = "course_info_resources_ground_armament_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ground_armament_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_ground_armaments.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="ground_equipment_armament_items")
    ground_armament: Mapped["MasterGroundArmament | None"] = relationship()


class CourseInfoResourcesPersonalFlightEquipmentItem(Base):
    __tablename__ = "course_info_resources_personal_flight_equipment_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    personal_flight_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_personal_flight_equipment.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="personal_flight_equipment_items")
    personal_flight_equipment: Mapped["MasterPersonalFlightEquipment | None"] = relationship()


class CourseInfoResourcesAviationLifeSupportItem(Base):
    __tablename__ = "course_info_resources_aviation_life_support_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aviation_life_support_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_aviation_life_support_equipment.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="aviation_life_support_equipment_items")
    aviation_life_support_equipment: Mapped["MasterAviationLifeSupportEquipment | None"] = relationship()


class CourseInfoResourcesClassroomRequirementItem(Base):
    __tablename__ = "course_info_resources_classroom_requirement_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    classroom_requirement_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_classroom_requirements.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="classroom_requirement_items")
    classroom_requirement: Mapped["MasterClassroomRequirement | None"] = relationship()


class CourseInfoResourcesTrainingMaterialAidItem(Base):
    __tablename__ = "course_info_resources_training_material_aid_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_resources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    training_material_aid_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_training_material_aids.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseInfoResources"] = relationship(back_populates="training_material_aid_items")
    training_material_aid: Mapped["MasterTrainingMaterialAid | None"] = relationship()


class CourseInfoLessonPlanning(AuditedMixin, Base):
    """Typed storage for the Lesson Planning tab.

    One row per CourseMaster. Period counts/durations are integers; objectives
    and teaching points are long-form text; the three selectable fields
    (type-of-period, classification-of-period, environment) are FKs into
    their per-field master tables with ``ON DELETE SET NULL``.
    """

    __tablename__ = "course_info_lesson_planning"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    number_of_periods_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Allows half-days (e.g. 5.5); persisted as a float, constrained to .0/.5 steps by the schema.
    number_of_training_days_per_week: Mapped[float | None] = mapped_column(Float, nullable=True)
    number_of_periods_per_half_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    period_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    course_master: Mapped["CourseMaster"] = relationship(back_populates="lesson_planning")
    training_objectives: Mapped[list["CourseInfoLessonPlanningTrainingObjective"]] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonPlanningTrainingObjective.order_index",
    )
    enabling_objectives: Mapped[list["CourseInfoLessonPlanningEnablingObjective"]] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonPlanningEnablingObjective.order_index",
    )
    teaching_points: Mapped[list["CourseInfoLessonPlanningTeachingPoint"]] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonPlanningTeachingPoint.order_index",
    )
    type_of_periods: Mapped[list["CourseInfoLessonPlanningTypeOfPeriod"]] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonPlanningTypeOfPeriod.order_index",
    )
    classification_of_periods: Mapped[list["CourseInfoLessonPlanningClassificationOfPeriod"]] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonPlanningClassificationOfPeriod.order_index",
    )
    environments: Mapped[list["CourseInfoLessonPlanningEnvironment"]] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonPlanningEnvironment.order_index",
    )


class CourseInfoLessonPlanningTypeOfPeriod(Base):
    __tablename__ = "course_info_lesson_planning_type_of_periods"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    type_of_period_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_period_types.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseInfoLessonPlanning"] = relationship(back_populates="type_of_periods")
    type_of_period: Mapped["MasterPeriodType | None"] = relationship()


class CourseInfoLessonPlanningClassificationOfPeriod(Base):
    __tablename__ = "course_info_lesson_planning_classification_of_periods"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    classification_of_period_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_period_classifications.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseInfoLessonPlanning"] = relationship(back_populates="classification_of_periods")
    classification_of_period: Mapped["MasterPeriodClassification | None"] = relationship()


class CourseInfoLessonPlanningEnvironment(Base):
    __tablename__ = "course_info_lesson_planning_environments"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    environment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_environments.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseInfoLessonPlanning"] = relationship(back_populates="environments")
    environment: Mapped["MasterEnvironment | None"] = relationship()


class CourseInfoLessonPlanningTrainingObjective(Base):
    __tablename__ = "course_info_lesson_planning_training_objectives"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    training_objective_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_training_objectives.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseInfoLessonPlanning"] = relationship(back_populates="training_objectives")
    training_objective: Mapped["MasterTrainingObjective | None"] = relationship()


class CourseInfoLessonPlanningEnablingObjective(Base):
    __tablename__ = "course_info_lesson_planning_enabling_objectives"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enabling_objective_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_enabling_objectives.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseInfoLessonPlanning"] = relationship(back_populates="enabling_objectives")
    enabling_objective: Mapped["MasterEnablingObjective | None"] = relationship()


class CourseInfoLessonPlanningTeachingPoint(Base):
    __tablename__ = "course_info_lesson_planning_teaching_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    teaching_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_teaching_points.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseInfoLessonPlanning"] = relationship(back_populates="teaching_points")
    teaching_point: Mapped["MasterTeachingPoint | None"] = relationship()


class CourseInfoLessonCreation(AuditedMixin, Base):
    """Typed storage for the Lesson Creation tab.

    One row per CourseMaster. Holds the tab status; the actual lessons are
    stored as ordered child rows in ``course_info_lesson_creation_lessons``.
    """

    __tablename__ = "course_info_lesson_creation"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_master_id: Mapped[int] = mapped_column(
        ForeignKey("course_masters.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    course_master: Mapped["CourseMaster"] = relationship(back_populates="lesson_creation")
    lessons: Mapped[list["CourseInfoLessonCreationLesson"]] = relationship(
        back_populates="lesson_creation",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonCreationLesson.order_index",
    )


class CourseInfoLessonCreationLesson(Base):
    """One lesson row for the Lesson Creation tab.

    Stored as a child row of ``course_info_lesson_creation`` so the field
    can hold an ordered list of typed lesson entries.
    """

    __tablename__ = "course_info_lesson_creation_lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_creation_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_creation.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lesson_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lesson_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    environment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_environments.id", ondelete="SET NULL"), nullable=True
    )
    period_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_period_types.id", ondelete="SET NULL"), nullable=True
    )
    flight_timing: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Size of a block unit (number of periods) used when this lesson is laid out
    # on the schedule.
    period_per_unit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Free-form "instructor:student" ratio (e.g. "1:8"); format validated client-side.
    instructor_student_ratio: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    health_and_safety: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson_creation: Mapped["CourseInfoLessonCreation"] = relationship(back_populates="lessons")
    environment: Mapped["MasterEnvironment | None"] = relationship()
    period_type: Mapped["MasterPeriodType | None"] = relationship()
    units: Mapped[list["CourseInfoLessonCreationLessonUnit"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonCreationLessonUnit.order_index",
    )
    resources: Mapped[list["CourseInfoLessonCreationLessonResource"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonCreationLessonResource.order_index",
    )
    conducts: Mapped[list["CourseInfoLessonCreationLessonConduct"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="CourseInfoLessonCreationLessonConduct.order_index",
    )


class CourseInfoLessonCreationLessonUnit(Base):
    """One (TO, EO, TP) unit attached to a Lesson Creation lesson row.

    A lesson can have many units; each unit is an independent picklist
    triple — Training Objective, Enabling Objective, Teaching Point — all
    drawn from the per-field master tables populated by the Lesson Planning
    tab.
    """

    __tablename__ = "course_info_lesson_creation_lesson_units"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_creation_lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    training_objective_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_training_objectives.id", ondelete="SET NULL"), nullable=True
    )
    enabling_objective_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_enabling_objectives.id", ondelete="SET NULL"), nullable=True
    )
    teaching_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_teaching_points.id", ondelete="SET NULL"), nullable=True
    )

    lesson: Mapped["CourseInfoLessonCreationLesson"] = relationship(back_populates="units")
    training_objective: Mapped["MasterTrainingObjective | None"] = relationship()
    enabling_objective: Mapped["MasterEnablingObjective | None"] = relationship()
    teaching_point: Mapped["MasterTeachingPoint | None"] = relationship()


class CourseInfoLessonCreationLessonResource(Base):
    """One resource attached to a Lesson Creation lesson row.

    The user picks a resource category (e.g. ``aircraft_type``) and then a
    specific resource within it, both sourced from the course's Resources tab.
    Because each category is backed by a *different* master table, the chosen
    resource is stored polymorphically: ``category`` holds the combo-box kind
    and ``resource_id`` the master row id — there is no single FK to enforce.
    Resolving the label happens via the category's master table on read.
    """

    __tablename__ = "course_info_lesson_creation_lesson_resources"
    # Explicit short index name — the auto-generated one exceeds Postgres's
    # 63-char identifier limit.
    __table_args__ = (
        Index("ix_cilc_lesson_resources_lesson_id", "course_info_lesson_creation_lesson_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_creation_lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    lesson: Mapped["CourseInfoLessonCreationLesson"] = relationship(back_populates="resources")


class CourseInfoLessonCreationLessonConduct(Base):
    """One conduct record attached to a Lesson Creation lesson row.

    Records are grouped by ``part`` — one of ``BEGINNING``, ``MIDDLE`` or
    ``END`` — and each carries free-text ``point``, ``material`` and ``notes``.
    """

    __tablename__ = "course_info_lesson_creation_lesson_conducts"
    # Explicit short index name — the auto-generated one exceeds Postgres's
    # 63-char identifier limit.
    __table_args__ = (
        Index("ix_cilc_lesson_conducts_lesson_id", "course_info_lesson_creation_lesson_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_info_lesson_creation_lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    part: Mapped[str | None] = mapped_column(String(20), nullable=True)
    point: Mapped[str | None] = mapped_column(Text, nullable=True)
    material: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson: Mapped["CourseInfoLessonCreationLesson"] = relationship(back_populates="conducts")


__all__ = [
    "CourseInfoGeneralInformation",
    "CourseInfoEntryStandard",
    "CourseInfoPersonnelRequirement",
    "CourseInfoResources",
    "CourseInfoResourcesAircraftItem",
    "CourseInfoResourcesAircraftMissionEquipmentItem",
    "CourseInfoResourcesAircraftArmamentItem",
    "CourseInfoResourcesSimulatorTypeItem",
    "CourseInfoResourcesMissionPlanningSystemItem",
    "CourseInfoResourcesGroundMaintenanceItem",
    "CourseInfoResourcesGroundArmamentItem",
    "CourseInfoResourcesPersonalFlightEquipmentItem",
    "CourseInfoResourcesAviationLifeSupportItem",
    "CourseInfoResourcesClassroomRequirementItem",
    "CourseInfoResourcesTrainingMaterialAidItem",
    "CourseInfoLessonPlanning",
    "CourseInfoLessonPlanningTrainingObjective",
    "CourseInfoLessonPlanningEnablingObjective",
    "CourseInfoLessonPlanningTeachingPoint",
    "CourseInfoLessonCreation",
    "CourseInfoLessonCreationLesson",
    "CourseInfoLessonCreationLessonUnit",
    "CourseInfoLessonCreationLessonResource",
    "CourseInfoLessonCreationLessonConduct",
    "MasterAircraftType",
    "MasterAircraftMissionEquipment",
    "MasterAircraftArmament",
    "MasterSimulatorType",
    "MasterCourseEntryStandard",
    "MasterMissionPlanningSystem",
    "MasterGroundMaintenanceEquipment",
    "MasterGroundArmament",
    "MasterPersonalFlightEquipment",
    "MasterAviationLifeSupportEquipment",
    "MasterClassroomRequirement",
    "MasterTrainingMaterialAid",
    "MasterPeriodType",
    "MasterPeriodClassification",
    "MasterEnvironment",
    "MasterTrainingObjective",
    "MasterEnablingObjective",
    "MasterTeachingPoint",
    "MasterInstructorQualificationRequirement",
]
