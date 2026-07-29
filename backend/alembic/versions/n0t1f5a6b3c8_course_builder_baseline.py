"""course builder baseline: course master, course instance, material, and course info modules

Revision ID: n0t1f5a6b3c8
Revises: n0t1f5a6b3c7
Create Date: 2026-05-23 00:00:00.000000

Creates the full Course Builder schema in final form on top of the existing
catalog/courses permission namespace:

  - 19 master / dictionary tables
  - course_masters, course_instances, course_modification_requests
  - materials, material_folders, material_files
  - course_infos + 5 per-tab typed tables
  - 11 course_info_resources child item tables
  - 6 course_info_lesson_planning child tables
  - course_info_lesson_creation + lessons + lesson_units

All tables are created in FK-dependency order.  Single-FK columns that were
replaced by child tables in follow-on revisions are NOT recreated.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n0t1f5a6b3c8"
down_revision: Union[str, None] = "966324808b78"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ─── Master table helper ────────────────────────────────────────────────────

_MASTER_TABLES: tuple[str, ...] = (
    "master_aircraft_types",
    "master_aircraft_mission_equipment",
    "master_aircraft_armaments",
    "master_simulator_types",
    "master_course_entry_standards",
    "master_mission_planning_systems",
    "master_ground_maintenance_equipment",
    "master_ground_armaments",
    "master_personal_flight_equipment",
    "master_aviation_life_support_equipment",
    "master_classroom_requirements",
    "master_training_material_aids",
    "master_period_types",
    "master_period_classifications",
    "master_environments",
    "master_training_objectives",
    "master_enabling_objectives",
    "master_teaching_points",
    "master_instructor_qualification_requirements",
)


def _create_master_table(name: str) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("label", name=f"uq_{name}_label"),
    )


# ─── Upgrade ────────────────────────────────────────────────────────────────

def upgrade() -> None:
    # 1. Defensive permissions-table rename so the course:* namespace is free.
    op.execute(
        "UPDATE permissions SET code='catalog:read', module='catalog' WHERE code='course:read'"
    )
    op.execute(
        "UPDATE permissions SET code='catalog:write', module='catalog' WHERE code='course:write'"
    )

    # 2. Master / dictionary tables (no inter-FK deps except users.id).
    for name in _MASTER_TABLES:
        _create_master_table(name)

    # 3. course_masters
    op.create_table(
        "course_masters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("course_date", sa.Date(), nullable=True),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'draft'"),
        ),
        sa.Column(
            "course_info_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "material_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "surveys_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "evaluation_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "schedule_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 4. course_instances
    op.create_table(
        "course_instances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("master_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("course_date", sa.Date(), nullable=True),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'draft'"),
        ),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("class_time", sa.String(length=50), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column(
            "material_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "surveys_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "evaluation_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "schedule_completion", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["master_id"], ["course_masters.id"]),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_instances_master_id",
        "course_instances",
        ["master_id"],
        unique=False,
    )

    # 5. course_modification_requests
    op.create_table(
        "course_modification_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("requested_by_id", sa.Integer(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'WAIT_APPROVAL'"),
        ),
        sa.Column("decided_by_id", sa.Integer(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decision_note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"], ["course_instances.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_modification_requests_course_id",
        "course_modification_requests",
        ["course_id"],
        unique=False,
    )

    # 6. materials
    op.create_table(
        "materials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_master_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'incomplete'"),
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_master_id"], ["course_masters.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_master_id", name="uq_materials_course_master_id",
        ),
    )
    op.create_index(
        "ix_materials_course_master_id",
        "materials",
        ["course_master_id"],
        unique=False,
    )

    # 7. material_folders
    op.create_table(
        "material_folders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["material_id"], ["materials.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["material_folders.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_material_folders_material_id",
        "material_folders",
        ["material_id"],
        unique=False,
    )
    op.create_index(
        "ix_material_folders_parent_id",
        "material_folders",
        ["parent_id"],
        unique=False,
    )

    # 8. material_files
    op.create_table(
        "material_files",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.UUID(), nullable=True),
        sa.Column("uploader_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("thumbnail_key", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["material_id"], ["materials.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["folder_id"], ["material_folders.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploader_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_material_files_material_id",
        "material_files",
        ["material_id"],
        unique=False,
    )
    op.create_index(
        "ix_material_files_folder_id",
        "material_files",
        ["folder_id"],
        unique=False,
    )

    # 9. course_infos
    op.create_table(
        "course_infos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_master_id", sa.Integer(), nullable=False),
        sa.Column("course_title", sa.String(length=255), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'created'"),
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_master_id"], ["course_masters.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_master_id", name="uq_course_infos_course_master_id",
        ),
    )
    op.create_index(
        "ix_course_infos_course_master_id",
        "course_infos",
        ["course_master_id"],
        unique=False,
    )

    # 10. course_info_general
    op.create_table(
        "course_info_general",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'incomplete'"),
        ),
        sa.Column("course_title", sa.String(length=255), nullable=True),
        sa.Column("course_duration", sa.Integer(), nullable=True),
        sa.Column(
            "programmed_working_frequency", sa.String(length=20), nullable=True,
        ),
        sa.Column("programmed_working_start_time", sa.Time(), nullable=True),
        sa.Column("programmed_working_end_time", sa.Time(), nullable=True),
        sa.Column("ctp_version", sa.String(length=100), nullable=True),
        sa.Column("course_aim", sa.Text(), nullable=True),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_id"], ["course_infos.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_info_id",
            name="uq_course_info_general_course_info_id",
        ),
    )
    op.create_index(
        "ix_course_info_general_course_info_id",
        "course_info_general",
        ["course_info_id"],
        unique=False,
    )

    # 11. course_info_entry_standards
    op.create_table(
        "course_info_entry_standards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_general_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("course_entry_standard_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_general_id"],
            ["course_info_general.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["course_entry_standard_id"],
            ["master_course_entry_standards.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_info_entry_standards_general_id",
        "course_info_entry_standards",
        ["course_info_general_id"],
        unique=False,
    )

    # 12. course_info_personnel_requirement
    op.create_table(
        "course_info_personnel_requirement",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'incomplete'"),
        ),
        sa.Column("maximum_trainees_number", sa.Integer(), nullable=True),
        sa.Column("minimum_trainees_number", sa.Integer(), nullable=True),
        sa.Column(
            "instructors_to_trainees_ratio_flight",
            sa.String(length=100), nullable=True,
        ),
        sa.Column(
            "instructors_to_trainees_ratio_classroom",
            sa.String(length=100), nullable=True,
        ),
        sa.Column(
            "instructors_to_trainees_ratio_practical",
            sa.String(length=100), nullable=True,
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_id"], ["course_infos.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_info_id",
            name="uq_course_info_personnel_requirement_course_info_id",
        ),
    )
    op.create_index(
        "ix_course_info_personnel_requirement_course_info_id",
        "course_info_personnel_requirement",
        ["course_info_id"],
        unique=False,
    )

    # 13. course_info_instructor_qualification_requirements
    op.create_table(
        "course_info_instructor_qualification_requirements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_personnel_requirement_id",
            sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "instructor_qualification_requirement_id",
            sa.Integer(), nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_personnel_requirement_id"],
            ["course_info_personnel_requirement.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["instructor_qualification_requirement_id"],
            ["master_instructor_qualification_requirements.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_info_instructor_qualification_requirements_pr_id",
        "course_info_instructor_qualification_requirements",
        ["course_info_personnel_requirement_id"],
        unique=False,
    )

    # 14. course_info_resources
    op.create_table(
        "course_info_resources",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'incomplete'"),
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_id"], ["course_infos.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_info_id",
            name="uq_course_info_resources_course_info_id",
        ),
    )
    op.create_index(
        "ix_course_info_resources_course_info_id",
        "course_info_resources",
        ["course_info_id"],
        unique=False,
    )

    # 15. Resources child item tables
    # --- Aircraft ---
    op.create_table(
        "course_info_resources_aircraft_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("aircraft_type_id", sa.Integer(), nullable=True),
        sa.Column("number_of_aircraft", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["aircraft_type_id"],
            ["master_aircraft_types.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_info_resources_aircraft_items_resources_id",
        "course_info_resources_aircraft_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Aircraft Mission Equipment ---
    op.create_table(
        "course_info_resources_aircraft_mission_equipment_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("aircraft_mission_equipment_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["aircraft_mission_equipment_id"],
            ["master_aircraft_mission_equipment.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_aircraft_mission_equip_res_id",
        "course_info_resources_aircraft_mission_equipment_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Aircraft Armament ---
    op.create_table(
        "course_info_resources_aircraft_armament_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("aircraft_armament_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["aircraft_armament_id"],
            ["master_aircraft_armaments.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_aircraft_armament_res_id",
        "course_info_resources_aircraft_armament_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Simulator Type ---
    op.create_table(
        "course_info_resources_simulator_type_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("simulator_type_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["simulator_type_id"],
            ["master_simulator_types.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_simulator_type_res_id",
        "course_info_resources_simulator_type_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Mission Planning System ---
    op.create_table(
        "course_info_resources_mission_planning_system_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("mission_planning_system_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["mission_planning_system_id"],
            ["master_mission_planning_systems.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_mission_plan_sys_res_id",
        "course_info_resources_mission_planning_system_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Ground Maintenance ---
    op.create_table(
        "course_info_resources_ground_maintenance_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("ground_maintenance_equipment_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ground_maintenance_equipment_id"],
            ["master_ground_maintenance_equipment.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_ground_maintenance_res_id",
        "course_info_resources_ground_maintenance_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Ground Armament ---
    op.create_table(
        "course_info_resources_ground_armament_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("ground_armament_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ground_armament_id"],
            ["master_ground_armaments.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_ground_armament_res_id",
        "course_info_resources_ground_armament_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Personal Flight Equipment ---
    op.create_table(
        "course_info_resources_personal_flight_equipment_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("personal_flight_equipment_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["personal_flight_equipment_id"],
            ["master_personal_flight_equipment.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_personal_flight_equip_res_id",
        "course_info_resources_personal_flight_equipment_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Aviation Life Support ---
    op.create_table(
        "course_info_resources_aviation_life_support_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("aviation_life_support_equipment_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["aviation_life_support_equipment_id"],
            ["master_aviation_life_support_equipment.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_aviation_life_support_res_id",
        "course_info_resources_aviation_life_support_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Classroom Requirement ---
    op.create_table(
        "course_info_resources_classroom_requirement_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("classroom_requirement_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["classroom_requirement_id"],
            ["master_classroom_requirements.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_classroom_req_res_id",
        "course_info_resources_classroom_requirement_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # --- Training Material Aid ---
    op.create_table(
        "course_info_resources_training_material_aid_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_resources_id", sa.Integer(), nullable=False),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("training_material_aid_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_resources_id"],
            ["course_info_resources.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["training_material_aid_id"],
            ["master_training_material_aids.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cir_training_material_aid_res_id",
        "course_info_resources_training_material_aid_items",
        ["course_info_resources_id"],
        unique=False,
    )

    # 16. course_info_lesson_planning
    op.create_table(
        "course_info_lesson_planning",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'incomplete'"),
        ),
        sa.Column("number_of_periods_per_day", sa.Integer(), nullable=True),
        sa.Column("number_of_training_days_per_week", sa.Integer(), nullable=True),
        sa.Column("period_duration_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_id"], ["course_infos.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_info_id",
            name="uq_course_info_lesson_planning_course_info_id",
        ),
    )
    op.create_index(
        "ix_course_info_lesson_planning_course_info_id",
        "course_info_lesson_planning",
        ["course_info_id"],
        unique=False,
    )

    # 17. Lesson Planning child tables
    # --- Type of Period ---
    op.create_table(
        "course_info_lesson_planning_type_of_periods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_planning_id", sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("type_of_period_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_planning_id"],
            ["course_info_lesson_planning.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["type_of_period_id"],
            ["master_period_types.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cilp_type_of_periods_lp_id",
        "course_info_lesson_planning_type_of_periods",
        ["course_info_lesson_planning_id"],
        unique=False,
    )

    # --- Classification of Period ---
    op.create_table(
        "course_info_lesson_planning_classification_of_periods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_planning_id", sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("classification_of_period_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_planning_id"],
            ["course_info_lesson_planning.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["classification_of_period_id"],
            ["master_period_classifications.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cilp_classification_of_periods_lp_id",
        "course_info_lesson_planning_classification_of_periods",
        ["course_info_lesson_planning_id"],
        unique=False,
    )

    # --- Environment ---
    op.create_table(
        "course_info_lesson_planning_environments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_planning_id", sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("environment_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_planning_id"],
            ["course_info_lesson_planning.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["environment_id"],
            ["master_environments.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cilp_environments_lp_id",
        "course_info_lesson_planning_environments",
        ["course_info_lesson_planning_id"],
        unique=False,
    )

    # --- Training Objective ---
    op.create_table(
        "course_info_lesson_planning_training_objectives",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_planning_id", sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("training_objective_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_planning_id"],
            ["course_info_lesson_planning.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["training_objective_id"],
            ["master_training_objectives.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cilp_training_objectives_lp_id",
        "course_info_lesson_planning_training_objectives",
        ["course_info_lesson_planning_id"],
        unique=False,
    )

    # --- Enabling Objective ---
    op.create_table(
        "course_info_lesson_planning_enabling_objectives",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_planning_id", sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("enabling_objective_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_planning_id"],
            ["course_info_lesson_planning.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["enabling_objective_id"],
            ["master_enabling_objectives.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cilp_enabling_objectives_lp_id",
        "course_info_lesson_planning_enabling_objectives",
        ["course_info_lesson_planning_id"],
        unique=False,
    )

    # --- Teaching Point ---
    op.create_table(
        "course_info_lesson_planning_teaching_points",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_planning_id", sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("teaching_point_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_planning_id"],
            ["course_info_lesson_planning.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["teaching_point_id"],
            ["master_teaching_points.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cilp_teaching_points_lp_id",
        "course_info_lesson_planning_teaching_points",
        ["course_info_lesson_planning_id"],
        unique=False,
    )

    # 18. course_info_lesson_creation
    op.create_table(
        "course_info_lesson_creation",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_info_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.String(length=20), nullable=False,
            server_default=sa.text("'incomplete'"),
        ),
        sa.Column(
            "version", sa.Integer(), nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_id"], ["course_infos.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"], ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_info_id",
            name="uq_course_info_lesson_creation_course_info_id",
        ),
    )
    op.create_index(
        "ix_course_info_lesson_creation_course_info_id",
        "course_info_lesson_creation",
        ["course_info_id"],
        unique=False,
    )

    # 19. course_info_lesson_creation_lessons
    op.create_table(
        "course_info_lesson_creation_lessons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_creation_id", sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("lesson_number", sa.String(length=50), nullable=True),
        sa.Column("lesson_title", sa.String(length=255), nullable=True),
        sa.Column("environment_id", sa.Integer(), nullable=True),
        sa.Column("period_type_id", sa.Integer(), nullable=True),
        sa.Column("flight_timing", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_creation_id"],
            ["course_info_lesson_creation.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["environment_id"],
            ["master_environments.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["period_type_id"],
            ["master_period_types.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_info_lesson_creation_lessons_parent_id",
        "course_info_lesson_creation_lessons",
        ["course_info_lesson_creation_id"],
        unique=False,
    )

    # 20. course_info_lesson_creation_lesson_units
    op.create_table(
        "course_info_lesson_creation_lesson_units",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "course_info_lesson_creation_lesson_id",
            sa.Integer(), nullable=False,
        ),
        sa.Column(
            "order_index", sa.Integer(), nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("training_objective_id", sa.Integer(), nullable=True),
        sa.Column("enabling_objective_id", sa.Integer(), nullable=True),
        sa.Column("teaching_point_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["course_info_lesson_creation_lesson_id"],
            ["course_info_lesson_creation_lessons.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["training_objective_id"],
            ["master_training_objectives.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["enabling_objective_id"],
            ["master_enabling_objectives.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["teaching_point_id"],
            ["master_teaching_points.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_course_info_lesson_creation_lesson_units_lesson_id",
        "course_info_lesson_creation_lesson_units",
        ["course_info_lesson_creation_lesson_id"],
        unique=False,
    )


# ─── Downgrade ────────────────────────────────────────────────────────────

def downgrade() -> None:
    # 1. course_info_lesson_creation_lesson_units
    op.drop_index(
        "ix_course_info_lesson_creation_lesson_units_lesson_id",
        table_name="course_info_lesson_creation_lesson_units",
    )
    op.drop_table("course_info_lesson_creation_lesson_units")

    # 2. course_info_lesson_creation_lessons
    op.drop_index(
        "ix_course_info_lesson_creation_lessons_parent_id",
        table_name="course_info_lesson_creation_lessons",
    )
    op.drop_table("course_info_lesson_creation_lessons")

    # 3. course_info_lesson_creation
    op.drop_index(
        "ix_course_info_lesson_creation_course_info_id",
        table_name="course_info_lesson_creation",
    )
    op.drop_table("course_info_lesson_creation")

    # 4. Lesson Planning child tables
    op.drop_index(
        "ix_cilp_teaching_points_lp_id",
        table_name="course_info_lesson_planning_teaching_points",
    )
    op.drop_table("course_info_lesson_planning_teaching_points")

    op.drop_index(
        "ix_cilp_enabling_objectives_lp_id",
        table_name="course_info_lesson_planning_enabling_objectives",
    )
    op.drop_table("course_info_lesson_planning_enabling_objectives")

    op.drop_index(
        "ix_cilp_training_objectives_lp_id",
        table_name="course_info_lesson_planning_training_objectives",
    )
    op.drop_table("course_info_lesson_planning_training_objectives")

    op.drop_index(
        "ix_cilp_environments_lp_id",
        table_name="course_info_lesson_planning_environments",
    )
    op.drop_table("course_info_lesson_planning_environments")

    op.drop_index(
        "ix_cilp_classification_of_periods_lp_id",
        table_name="course_info_lesson_planning_classification_of_periods",
    )
    op.drop_table("course_info_lesson_planning_classification_of_periods")

    op.drop_index(
        "ix_cilp_type_of_periods_lp_id",
        table_name="course_info_lesson_planning_type_of_periods",
    )
    op.drop_table("course_info_lesson_planning_type_of_periods")

    # 5. course_info_lesson_planning
    op.drop_index(
        "ix_course_info_lesson_planning_course_info_id",
        table_name="course_info_lesson_planning",
    )
    op.drop_table("course_info_lesson_planning")

    # 6. Resources child item tables
    op.drop_index(
        "ix_cir_training_material_aid_res_id",
        table_name="course_info_resources_training_material_aid_items",
    )
    op.drop_table("course_info_resources_training_material_aid_items")

    op.drop_index(
        "ix_cir_classroom_req_res_id",
        table_name="course_info_resources_classroom_requirement_items",
    )
    op.drop_table("course_info_resources_classroom_requirement_items")

    op.drop_index(
        "ix_cir_aviation_life_support_res_id",
        table_name="course_info_resources_aviation_life_support_items",
    )
    op.drop_table("course_info_resources_aviation_life_support_items")

    op.drop_index(
        "ix_cir_personal_flight_equip_res_id",
        table_name="course_info_resources_personal_flight_equipment_items",
    )
    op.drop_table("course_info_resources_personal_flight_equipment_items")

    op.drop_index(
        "ix_cir_ground_armament_res_id",
        table_name="course_info_resources_ground_armament_items",
    )
    op.drop_table("course_info_resources_ground_armament_items")

    op.drop_index(
        "ix_cir_ground_maintenance_res_id",
        table_name="course_info_resources_ground_maintenance_items",
    )
    op.drop_table("course_info_resources_ground_maintenance_items")

    op.drop_index(
        "ix_cir_mission_plan_sys_res_id",
        table_name="course_info_resources_mission_planning_system_items",
    )
    op.drop_table("course_info_resources_mission_planning_system_items")

    op.drop_index(
        "ix_cir_simulator_type_res_id",
        table_name="course_info_resources_simulator_type_items",
    )
    op.drop_table("course_info_resources_simulator_type_items")

    op.drop_index(
        "ix_cir_aircraft_armament_res_id",
        table_name="course_info_resources_aircraft_armament_items",
    )
    op.drop_table("course_info_resources_aircraft_armament_items")

    op.drop_index(
        "ix_cir_aircraft_mission_equip_res_id",
        table_name="course_info_resources_aircraft_mission_equipment_items",
    )
    op.drop_table("course_info_resources_aircraft_mission_equipment_items")

    op.drop_index(
        "ix_course_info_resources_aircraft_items_resources_id",
        table_name="course_info_resources_aircraft_items",
    )
    op.drop_table("course_info_resources_aircraft_items")

    # 7. course_info_resources
    op.drop_index(
        "ix_course_info_resources_course_info_id",
        table_name="course_info_resources",
    )
    op.drop_table("course_info_resources")

    # 8. course_info_instructor_qualification_requirements
    op.drop_index(
        "ix_course_info_instructor_qualification_requirements_pr_id",
        table_name="course_info_instructor_qualification_requirements",
    )
    op.drop_table("course_info_instructor_qualification_requirements")

    # 9. course_info_personnel_requirement
    op.drop_index(
        "ix_course_info_personnel_requirement_course_info_id",
        table_name="course_info_personnel_requirement",
    )
    op.drop_table("course_info_personnel_requirement")

    # 10. course_info_entry_standards
    op.drop_index(
        "ix_course_info_entry_standards_general_id",
        table_name="course_info_entry_standards",
    )
    op.drop_table("course_info_entry_standards")

    # 11. course_info_general
    op.drop_index(
        "ix_course_info_general_course_info_id",
        table_name="course_info_general",
    )
    op.drop_table("course_info_general")

    # 12. course_infos
    op.drop_index(
        "ix_course_infos_course_master_id",
        table_name="course_infos",
    )
    op.drop_table("course_infos")

    # 13. Material tables
    op.drop_index("ix_material_files_folder_id", table_name="material_files")
    op.drop_index("ix_material_files_material_id", table_name="material_files")
    op.drop_table("material_files")

    op.drop_index("ix_material_folders_parent_id", table_name="material_folders")
    op.drop_index("ix_material_folders_material_id", table_name="material_folders")
    op.drop_table("material_folders")

    op.drop_index("ix_materials_course_master_id", table_name="materials")
    op.drop_table("materials")

    # 14. Course Master block
    op.drop_index(
        "ix_course_modification_requests_course_id",
        table_name="course_modification_requests",
    )
    op.drop_table("course_modification_requests")

    op.drop_index("ix_course_instances_master_id", table_name="course_instances")
    op.drop_table("course_instances")

    op.drop_table("course_masters")

    # 15. Master tables
    for name in reversed(_MASTER_TABLES):
        op.drop_table(name)

    # 16. Reverse permissions rename
    op.execute(
        "UPDATE permissions SET code='course:read', module='courses' WHERE code='catalog:read'"
    )
    op.execute(
        "UPDATE permissions SET code='course:write', module='courses' WHERE code='catalog:write'"
    )
