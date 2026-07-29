from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text, Time
from datetime import time

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import AuditedMixin, Base

if TYPE_CHECKING:
    from app.modules.course.models import CourseInstance
    from app.modules.course_info.models import (
        MasterAircraftArmament,
        MasterAircraftMissionEquipment,
        MasterAircraftType,
        MasterAviationLifeSupportEquipment,
        MasterClassroomRequirement,
        MasterCourseEntryStandard,
        MasterEnablingObjective,
        MasterEnvironment,
        MasterGroundArmament,
        MasterGroundMaintenanceEquipment,
        MasterInstructorQualificationRequirement,
        MasterMissionPlanningSystem,
        MasterPeriodClassification,
        MasterPeriodType,
        MasterPersonalFlightEquipment,
        MasterSimulatorType,
        MasterTeachingPoint,
        MasterTrainingMaterialAid,
        MasterTrainingObjective,
    )


# ---------------------------------------------------------------------------
# Course Selection (instance) Course Information.
#
# These tables mirror the per-course typed tables in ``course_info/models.py``
# but are keyed on ``course_instance_id`` instead of ``course_master_id`` — the
# same "own tables, seeded from the master" pattern used by the Material, Form
# Builder and Evaluation instance categories. The combo-box dictionary tables
# (``master_*``) are GLOBAL and shared: these tables FK into the very same ones
# the master uses, never duplicates of them.
#
# Relationship attribute names on the child collections are kept IDENTICAL to
# the master models (``entry_standards``, ``aircraft_items``, ``lessons`` …) so
# the read-side serializers in ``course_info.services`` can be reused verbatim.
# ---------------------------------------------------------------------------


class CourseSelectionInfoGeneralInformation(AuditedMixin, Base):
    """Instance copy of the General Information tab (one row per course instance)."""

    __tablename__ = "course_selection_info_general"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
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
    # CTP Version lives on the instance row (the master stores it on CourseMaster).
    # Seeded from the master so the instance can diverge it independently.
    ctp_version: Mapped[str | None] = mapped_column(String(100), nullable=True)

    course: Mapped["CourseInstance"] = relationship(back_populates="course_info_general")
    entry_standards: Mapped[list["CourseSelectionInfoEntryStandard"]] = relationship(
        back_populates="general",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoEntryStandard.order_index",
    )


class CourseSelectionInfoEntryStandard(Base):
    __tablename__ = "course_selection_info_entry_standards"
    # Explicit short index names — the auto-generated ones exceed Postgres's
    # 63-char identifier limit.
    __table_args__ = (
        Index("ix_csi_entry_std_general_id", "course_selection_info_general_id"),
        Index("ix_csi_entry_std_master_id", "course_entry_standard_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_general_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_general.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    course_entry_standard_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_course_entry_standards.id", ondelete="SET NULL"),
        nullable=True,
    )

    general: Mapped["CourseSelectionInfoGeneralInformation"] = relationship(
        back_populates="entry_standards"
    )
    course_entry_standard: Mapped["MasterCourseEntryStandard | None"] = relationship()


class CourseSelectionInfoInstructorQualificationRequirement(Base):
    __tablename__ = "course_selection_info_instructor_qualification_requirements"
    # Explicit short index names — the auto-generated ones exceed Postgres's
    # 63-char identifier limit.
    __table_args__ = (
        Index("ix_csi_instr_qual_req_personnel_id", "course_selection_info_personnel_requirement_id"),
        Index("ix_csi_instr_qual_req_master_id", "instructor_qualification_requirement_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_personnel_requirement_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_personnel_requirement.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    instructor_qualification_requirement_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_instructor_qualification_requirements.id", ondelete="SET NULL"),
        nullable=True,
    )

    personnel_requirement: Mapped["CourseSelectionInfoPersonnelRequirement"] = relationship(
        back_populates="instructor_qualification_requirements"
    )
    instructor_qualification_requirement: Mapped[
        "MasterInstructorQualificationRequirement | None"
    ] = relationship()


class CourseSelectionInfoPersonnelRequirement(AuditedMixin, Base):
    """Instance copy of the Personnel Requirement tab."""

    __tablename__ = "course_selection_info_personnel_requirement"
    # Explicit short unique-index name — the auto-generated one exceeds
    # Postgres's 63-char identifier limit.
    __table_args__ = (
        Index("ix_csi_personnel_req_instance_id", "course_instance_id", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    maximum_trainees_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    minimum_trainees_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    instructors_to_trainees_ratio_flight: Mapped[str | None] = mapped_column(String(100), nullable=True)
    instructors_to_trainees_ratio_classroom: Mapped[str | None] = mapped_column(String(100), nullable=True)
    instructors_to_trainees_ratio_practical: Mapped[str | None] = mapped_column(String(100), nullable=True)

    course: Mapped["CourseInstance"] = relationship(
        back_populates="course_info_personnel_requirement"
    )
    instructor_qualification_requirements: Mapped[
        list["CourseSelectionInfoInstructorQualificationRequirement"]
    ] = relationship(
        back_populates="personnel_requirement",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoInstructorQualificationRequirement.order_index",
    )


class CourseSelectionInfoResources(AuditedMixin, Base):
    """Instance copy of the Resources tab."""

    __tablename__ = "course_selection_info_resources"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    course: Mapped["CourseInstance"] = relationship(back_populates="course_info_resources")
    aircraft_items: Mapped[list["CourseSelectionInfoResourcesAircraftItem"]] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesAircraftItem.order_index",
    )
    aircraft_mission_equipment_items: Mapped[
        list["CourseSelectionInfoResourcesAircraftMissionEquipmentItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesAircraftMissionEquipmentItem.order_index",
    )
    aircraft_armament_items: Mapped[
        list["CourseSelectionInfoResourcesAircraftArmamentItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesAircraftArmamentItem.order_index",
    )
    ground_equipment_simulator_type_items: Mapped[
        list["CourseSelectionInfoResourcesSimulatorTypeItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesSimulatorTypeItem.order_index",
    )
    ground_equipment_mission_planning_system_items: Mapped[
        list["CourseSelectionInfoResourcesMissionPlanningSystemItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesMissionPlanningSystemItem.order_index",
    )
    ground_equipment_maintenance_items: Mapped[
        list["CourseSelectionInfoResourcesGroundMaintenanceItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesGroundMaintenanceItem.order_index",
    )
    ground_equipment_armament_items: Mapped[
        list["CourseSelectionInfoResourcesGroundArmamentItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesGroundArmamentItem.order_index",
    )
    personal_flight_equipment_items: Mapped[
        list["CourseSelectionInfoResourcesPersonalFlightEquipmentItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesPersonalFlightEquipmentItem.order_index",
    )
    aviation_life_support_equipment_items: Mapped[
        list["CourseSelectionInfoResourcesAviationLifeSupportItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesAviationLifeSupportItem.order_index",
    )
    classroom_requirement_items: Mapped[
        list["CourseSelectionInfoResourcesClassroomRequirementItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesClassroomRequirementItem.order_index",
    )
    training_material_aid_items: Mapped[
        list["CourseSelectionInfoResourcesTrainingMaterialAidItem"]
    ] = relationship(
        back_populates="resources",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoResourcesTrainingMaterialAidItem.order_index",
    )


class CourseSelectionInfoResourcesAircraftItem(Base):
    __tablename__ = "course_selection_info_resources_aircraft_items"
    __table_args__ = (
        Index("ix_csi_res_aircraft_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aircraft_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_aircraft_types.id", ondelete="SET NULL"), nullable=True
    )
    number_of_aircraft: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(back_populates="aircraft_items")
    aircraft_type: Mapped["MasterAircraftType | None"] = relationship()


class CourseSelectionInfoResourcesAircraftMissionEquipmentItem(Base):
    # Table name shortened ("aircraft"→"acft", "equipment"→"equip") to stay
    # within Postgres's 63-char identifier limit.
    __tablename__ = "course_selection_info_resources_acft_mission_equip_items"
    __table_args__ = (
        Index("ix_csi_res_acft_mission_eq_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aircraft_mission_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_aircraft_mission_equipment.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="aircraft_mission_equipment_items"
    )
    aircraft_mission_equipment: Mapped["MasterAircraftMissionEquipment | None"] = relationship()


class CourseSelectionInfoResourcesAircraftArmamentItem(Base):
    __tablename__ = "course_selection_info_resources_aircraft_armament_items"
    __table_args__ = (
        Index("ix_csi_res_acft_armament_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aircraft_armament_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_aircraft_armaments.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="aircraft_armament_items"
    )
    aircraft_armament: Mapped["MasterAircraftArmament | None"] = relationship()


class CourseSelectionInfoResourcesSimulatorTypeItem(Base):
    __tablename__ = "course_selection_info_resources_simulator_type_items"
    __table_args__ = (
        Index("ix_csi_res_simulator_type_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    simulator_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_simulator_types.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="ground_equipment_simulator_type_items"
    )
    simulator_type: Mapped["MasterSimulatorType | None"] = relationship()


class CourseSelectionInfoResourcesMissionPlanningSystemItem(Base):
    __tablename__ = "course_selection_info_resources_mission_planning_system_items"
    __table_args__ = (
        Index("ix_csi_res_mission_plan_sys_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mission_planning_system_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_mission_planning_systems.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="ground_equipment_mission_planning_system_items"
    )
    mission_planning_system: Mapped["MasterMissionPlanningSystem | None"] = relationship()


class CourseSelectionInfoResourcesGroundMaintenanceItem(Base):
    __tablename__ = "course_selection_info_resources_ground_maintenance_items"
    __table_args__ = (
        Index("ix_csi_res_ground_maint_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ground_maintenance_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_ground_maintenance_equipment.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="ground_equipment_maintenance_items"
    )
    ground_maintenance_equipment: Mapped["MasterGroundMaintenanceEquipment | None"] = relationship()


class CourseSelectionInfoResourcesGroundArmamentItem(Base):
    __tablename__ = "course_selection_info_resources_ground_armament_items"
    __table_args__ = (
        Index("ix_csi_res_ground_armament_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ground_armament_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_ground_armaments.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="ground_equipment_armament_items"
    )
    ground_armament: Mapped["MasterGroundArmament | None"] = relationship()


class CourseSelectionInfoResourcesPersonalFlightEquipmentItem(Base):
    __tablename__ = "course_selection_info_resources_personal_flight_equipment_items"
    __table_args__ = (
        Index("ix_csi_res_personal_flight_eq_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    personal_flight_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_personal_flight_equipment.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="personal_flight_equipment_items"
    )
    personal_flight_equipment: Mapped["MasterPersonalFlightEquipment | None"] = relationship()


class CourseSelectionInfoResourcesAviationLifeSupportItem(Base):
    __tablename__ = "course_selection_info_resources_aviation_life_support_items"
    __table_args__ = (
        Index("ix_csi_res_aviation_life_supp_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aviation_life_support_equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_aviation_life_support_equipment.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="aviation_life_support_equipment_items"
    )
    aviation_life_support_equipment: Mapped["MasterAviationLifeSupportEquipment | None"] = relationship()


class CourseSelectionInfoResourcesClassroomRequirementItem(Base):
    __tablename__ = "course_selection_info_resources_classroom_requirement_items"
    __table_args__ = (
        Index("ix_csi_res_classroom_req_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    classroom_requirement_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_classroom_requirements.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="classroom_requirement_items"
    )
    classroom_requirement: Mapped["MasterClassroomRequirement | None"] = relationship()


class CourseSelectionInfoResourcesTrainingMaterialAidItem(Base):
    __tablename__ = "course_selection_info_resources_training_material_aid_items"
    __table_args__ = (
        Index("ix_csi_res_training_mat_aid_resources_id", "course_selection_info_resources_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_resources_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_resources.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    training_material_aid_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_training_material_aids.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    resources: Mapped["CourseSelectionInfoResources"] = relationship(
        back_populates="training_material_aid_items"
    )
    training_material_aid: Mapped["MasterTrainingMaterialAid | None"] = relationship()


class CourseSelectionInfoLessonPlanning(AuditedMixin, Base):
    """Instance copy of the Lesson Planning tab."""

    __tablename__ = "course_selection_info_lesson_planning"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    number_of_periods_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    number_of_training_days_per_week: Mapped[float | None] = mapped_column(Float, nullable=True)
    number_of_periods_per_half_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    period_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    course: Mapped["CourseInstance"] = relationship(back_populates="course_info_lesson_planning")
    training_objectives: Mapped[
        list["CourseSelectionInfoLessonPlanningTrainingObjective"]
    ] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonPlanningTrainingObjective.order_index",
    )
    enabling_objectives: Mapped[
        list["CourseSelectionInfoLessonPlanningEnablingObjective"]
    ] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonPlanningEnablingObjective.order_index",
    )
    teaching_points: Mapped[
        list["CourseSelectionInfoLessonPlanningTeachingPoint"]
    ] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonPlanningTeachingPoint.order_index",
    )
    type_of_periods: Mapped[
        list["CourseSelectionInfoLessonPlanningTypeOfPeriod"]
    ] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonPlanningTypeOfPeriod.order_index",
    )
    classification_of_periods: Mapped[
        list["CourseSelectionInfoLessonPlanningClassificationOfPeriod"]
    ] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonPlanningClassificationOfPeriod.order_index",
    )
    environments: Mapped[
        list["CourseSelectionInfoLessonPlanningEnvironment"]
    ] = relationship(
        back_populates="lesson_planning",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonPlanningEnvironment.order_index",
    )


class CourseSelectionInfoLessonPlanningTypeOfPeriod(Base):
    __tablename__ = "course_selection_info_lesson_planning_type_of_periods"
    __table_args__ = (
        Index("ix_csi_lp_type_of_periods_lp_id", "course_selection_info_lesson_planning_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    type_of_period_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_period_types.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseSelectionInfoLessonPlanning"] = relationship(
        back_populates="type_of_periods"
    )
    type_of_period: Mapped["MasterPeriodType | None"] = relationship()


class CourseSelectionInfoLessonPlanningClassificationOfPeriod(Base):
    __tablename__ = "course_selection_info_lesson_planning_classification_of_periods"
    __table_args__ = (
        Index("ix_csi_lp_classif_of_periods_lp_id", "course_selection_info_lesson_planning_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    classification_of_period_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_period_classifications.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseSelectionInfoLessonPlanning"] = relationship(
        back_populates="classification_of_periods"
    )
    classification_of_period: Mapped["MasterPeriodClassification | None"] = relationship()


class CourseSelectionInfoLessonPlanningEnvironment(Base):
    __tablename__ = "course_selection_info_lesson_planning_environments"
    __table_args__ = (
        Index("ix_csi_lp_environments_lp_id", "course_selection_info_lesson_planning_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    environment_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_environments.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseSelectionInfoLessonPlanning"] = relationship(
        back_populates="environments"
    )
    environment: Mapped["MasterEnvironment | None"] = relationship()


class CourseSelectionInfoLessonPlanningTrainingObjective(Base):
    __tablename__ = "course_selection_info_lesson_planning_training_objectives"
    __table_args__ = (
        Index("ix_csi_lp_training_objectives_lp_id", "course_selection_info_lesson_planning_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    training_objective_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_training_objectives.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseSelectionInfoLessonPlanning"] = relationship(
        back_populates="training_objectives"
    )
    training_objective: Mapped["MasterTrainingObjective | None"] = relationship()


class CourseSelectionInfoLessonPlanningEnablingObjective(Base):
    __tablename__ = "course_selection_info_lesson_planning_enabling_objectives"
    __table_args__ = (
        Index("ix_csi_lp_enabling_objectives_lp_id", "course_selection_info_lesson_planning_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enabling_objective_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_enabling_objectives.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseSelectionInfoLessonPlanning"] = relationship(
        back_populates="enabling_objectives"
    )
    enabling_objective: Mapped["MasterEnablingObjective | None"] = relationship()


class CourseSelectionInfoLessonPlanningTeachingPoint(Base):
    __tablename__ = "course_selection_info_lesson_planning_teaching_points"
    __table_args__ = (
        Index("ix_csi_lp_teaching_points_lp_id", "course_selection_info_lesson_planning_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_planning_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_planning.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    teaching_point_id: Mapped[int | None] = mapped_column(
        ForeignKey("master_teaching_points.id", ondelete="SET NULL"), nullable=True
    )

    lesson_planning: Mapped["CourseSelectionInfoLessonPlanning"] = relationship(
        back_populates="teaching_points"
    )
    teaching_point: Mapped["MasterTeachingPoint | None"] = relationship()


class CourseSelectionInfoLessonCreation(AuditedMixin, Base):
    """Instance copy of the Lesson Creation tab."""

    __tablename__ = "course_selection_info_lesson_creation"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_instance_id: Mapped[int] = mapped_column(
        ForeignKey("course_instances.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="incomplete", nullable=False)

    course: Mapped["CourseInstance"] = relationship(back_populates="course_info_lesson_creation")
    lessons: Mapped[list["CourseSelectionInfoLessonCreationLesson"]] = relationship(
        back_populates="lesson_creation",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonCreationLesson.order_index",
    )


class CourseSelectionInfoLessonCreationLesson(Base):
    __tablename__ = "course_selection_info_lesson_creation_lessons"
    __table_args__ = (
        Index("ix_csi_lc_lessons_lesson_creation_id", "course_selection_info_lesson_creation_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_creation_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation.id", ondelete="CASCADE"),
        nullable=False,
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
    instructor_student_ratio: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    health_and_safety: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson_creation: Mapped["CourseSelectionInfoLessonCreation"] = relationship(
        back_populates="lessons"
    )
    environment: Mapped["MasterEnvironment | None"] = relationship()
    period_type: Mapped["MasterPeriodType | None"] = relationship()
    units: Mapped[list["CourseSelectionInfoLessonCreationLessonUnit"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonCreationLessonUnit.order_index",
    )
    resources: Mapped[list["CourseSelectionInfoLessonCreationLessonResource"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonCreationLessonResource.order_index",
    )
    conducts: Mapped[list["CourseSelectionInfoLessonCreationLessonConduct"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="CourseSelectionInfoLessonCreationLessonConduct.order_index",
    )


class CourseSelectionInfoLessonCreationLessonUnit(Base):
    __tablename__ = "course_selection_info_lesson_creation_lesson_units"
    __table_args__ = (
        Index("ix_csi_lc_lesson_units_lesson_id", "course_selection_info_lesson_creation_lesson_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_creation_lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
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

    lesson: Mapped["CourseSelectionInfoLessonCreationLesson"] = relationship(back_populates="units")
    training_objective: Mapped["MasterTrainingObjective | None"] = relationship()
    enabling_objective: Mapped["MasterEnablingObjective | None"] = relationship()
    teaching_point: Mapped["MasterTeachingPoint | None"] = relationship()


class CourseSelectionInfoLessonCreationLessonResource(Base):
    __tablename__ = "course_selection_info_lesson_creation_lesson_resources"
    __table_args__ = (
        Index("ix_csilc_lesson_resources_lesson_id", "course_selection_info_lesson_creation_lesson_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_creation_lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    lesson: Mapped["CourseSelectionInfoLessonCreationLesson"] = relationship(back_populates="resources")


class CourseSelectionInfoLessonCreationLessonConduct(Base):
    __tablename__ = "course_selection_info_lesson_creation_lesson_conducts"
    __table_args__ = (
        Index("ix_csilc_lesson_conducts_lesson_id", "course_selection_info_lesson_creation_lesson_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    course_selection_info_lesson_creation_lesson_id: Mapped[int] = mapped_column(
        ForeignKey("course_selection_info_lesson_creation_lessons.id", ondelete="CASCADE"),
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    part: Mapped[str | None] = mapped_column(String(20), nullable=True)
    point: Mapped[str | None] = mapped_column(Text, nullable=True)
    material: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson: Mapped["CourseSelectionInfoLessonCreationLesson"] = relationship(back_populates="conducts")


__all__ = [
    "CourseSelectionInfoGeneralInformation",
    "CourseSelectionInfoEntryStandard",
    "CourseSelectionInfoPersonnelRequirement",
    "CourseSelectionInfoInstructorQualificationRequirement",
    "CourseSelectionInfoResources",
    "CourseSelectionInfoResourcesAircraftItem",
    "CourseSelectionInfoResourcesAircraftMissionEquipmentItem",
    "CourseSelectionInfoResourcesAircraftArmamentItem",
    "CourseSelectionInfoResourcesSimulatorTypeItem",
    "CourseSelectionInfoResourcesMissionPlanningSystemItem",
    "CourseSelectionInfoResourcesGroundMaintenanceItem",
    "CourseSelectionInfoResourcesGroundArmamentItem",
    "CourseSelectionInfoResourcesPersonalFlightEquipmentItem",
    "CourseSelectionInfoResourcesAviationLifeSupportItem",
    "CourseSelectionInfoResourcesClassroomRequirementItem",
    "CourseSelectionInfoResourcesTrainingMaterialAidItem",
    "CourseSelectionInfoLessonPlanning",
    "CourseSelectionInfoLessonPlanningTypeOfPeriod",
    "CourseSelectionInfoLessonPlanningClassificationOfPeriod",
    "CourseSelectionInfoLessonPlanningEnvironment",
    "CourseSelectionInfoLessonPlanningTrainingObjective",
    "CourseSelectionInfoLessonPlanningEnablingObjective",
    "CourseSelectionInfoLessonPlanningTeachingPoint",
    "CourseSelectionInfoLessonCreation",
    "CourseSelectionInfoLessonCreationLesson",
    "CourseSelectionInfoLessonCreationLessonUnit",
    "CourseSelectionInfoLessonCreationLessonResource",
    "CourseSelectionInfoLessonCreationLessonConduct",
]
