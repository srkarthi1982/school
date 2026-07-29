#!/usr/bin/env python3
r"""Populate every empty application table with coherent test data.

This is intended for local/test databases only. It is deterministic and
idempotent: tables that already contain data are never modified, while empty
tables receive representative records in foreign-key dependency order.

Run from the backend directory:

    .venv\Scripts\python.exe scripts\seed_complete_database.py
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import sys
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import (
    ARRAY,
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    Integer,
    LargeBinary,
    MetaData,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    and_,
    func,
    inspect,
    select,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.dialects.postgresql.base import ischema_names
from pgvector.sqlalchemy import Vector

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
os.chdir(_BACKEND_DIR)

_VENV_DIR = _BACKEND_DIR / ".venv"
if _VENV_DIR.exists() and Path(sys.prefix).resolve() != _VENV_DIR.resolve():
    raise SystemExit(
        "Run this script with the backend virtual environment:\n"
        f"    {_VENV_DIR / 'Scripts' / 'python.exe'} {Path(__file__).name}"
    )

# Follow the application's proven module-import order before reflecting models.
import app.main  # noqa: E402,F401
from app.core.database import engine  # noqa: E402

logger = logging.getLogger("complete_database_seed")

NOW = datetime(2026, 7, 29, 9, 0, tzinfo=timezone.utc)
TODAY = NOW.date()

# Domain tables deserve enough rows to make lists, dashboards and filters useful.
TARGET_ROWS = {
    "academic_years": 3,
    "departments": 4,
    "programs": 3,
    "semesters": 3,
    "sections": 3,
    "students": 4,
    "teachers": 4,
    "course_masters": 4,
    "courses": 4,
    "course_instances": 4,
    "course_enrollments": 6,
    "enrollments": 6,
    "course_instructors": 4,
    "currencies_master": 8,
    "flight_task_master": 5,
    "faqs": 5,
    "it_tickets": 4,
    "requests": 4,
    "chat_conversations": 3,
    "chat_messages": 8,
    "class_sessions": 3,
    "library_materials": 5,
    "notification_templates": 4,
    "schedule_entries": 8,
    "master_aircraft_types": 4,
    "master_simulator_types": 3,
    "master_environments": 3,
    "master_training_objectives": 5,
    "master_enabling_objectives": 6,
    "master_teaching_points": 8,
}

NAMES = [
    "Aisha Al Mansoori",
    "Omar Al Nuaimi",
    "Mariam Al Suwaidi",
    "Khalid Al Mazrouei",
    "Fatima Al Kaabi",
    "Saeed Al Shamsi",
]
COURSES = [
    "Commercial Pilot Ground School",
    "Advanced Flight Operations",
    "Aviation Safety Management",
    "Aircraft Systems and Performance",
]
DEPARTMENTS = [
    "Flight Training",
    "Aviation Safety",
    "Academic Affairs",
    "Student Services",
]
PROGRAMS = [
    "Commercial Pilot Licence",
    "Aviation Operations Diploma",
    "Safety Management Certificate",
]
AIRCRAFT = ["Cessna 172S", "Diamond DA42", "Airbus A320", "Boeing 737-800"]
STATUSES = ["active", "approved", "published", "scheduled"]
CURRENCIES = [
    ("United Arab Emirates Dirham", "AED"),
    ("United States Dollar", "USD"),
    ("Euro", "EUR"),
    ("British Pound Sterling", "GBP"),
    ("Saudi Riyal", "SAR"),
    ("Qatari Riyal", "QAR"),
    ("Omani Rial", "OMR"),
    ("Bahraini Dinar", "BHD"),
]
TABLE_LABELS = {
    "master_aircraft_armaments": ["Practice Bomb Rack", "Training Pylon Assembly"],
    "master_aircraft_mission_equipment": ["GPS Navigation Suite", "Weather Radar System"],
    "master_aviation_life_support_equipment": ["Flight Helmet and Oxygen Mask", "Life Vest"],
    "master_classroom_requirements": ["Smart Classroom - 24 Seats", "Briefing Room - 12 Seats"],
    "master_course_entry_standards": [
        "Valid Class 1 Medical Certificate",
        "English Language Proficiency Level 4",
    ],
    "master_enabling_objectives": [
        "Explain aircraft primary flight controls",
        "Interpret aviation weather reports",
        "Apply standard operating procedures",
        "Calculate aircraft weight and balance",
        "Demonstrate effective crew coordination",
        "Evaluate operational risk before flight",
    ],
    "master_environments": ["Classroom", "Flight Simulator", "Flight Line"],
    "master_ground_armaments": ["Training Ordnance Handling Kit", "Ground Safety Pin Set"],
    "master_ground_maintenance_equipment": ["Hydraulic Servicing Cart", "Aircraft Ground Power Unit"],
    "master_instructor_qualification_requirements": [
        "Certified Flight Instructor",
        "Safety Management Systems Instructor",
    ],
    "master_mission_planning_systems": ["Jeppesen FlightDeck Pro", "Electronic Flight Bag Suite"],
    "master_period_classifications": ["Ground Training", "Simulator Training"],
    "master_period_types": ["Lecture", "Practical Exercise"],
    "master_personal_flight_equipment": ["Pilot Headset", "High-Visibility Flight Vest"],
    "master_simulator_types": ["FNPT II Flight Simulator", "A320 Fixed-Base Trainer", "Procedures Trainer"],
    "master_teaching_points": [
        "Pre-flight planning and documentation",
        "Normal checklist discipline",
        "Aircraft energy management",
        "Radio communication procedures",
        "Threat and error management",
        "Approach stabilization criteria",
        "Post-flight reporting",
        "Emergency decision-making",
    ],
    "master_training_material_aids": ["Aircraft Systems Training Model", "Interactive Navigation Chart"],
    "master_training_objectives": [
        "Conduct a safe and compliant training flight",
        "Apply aviation regulations during flight planning",
        "Demonstrate professional cockpit communication",
        "Manage abnormal situations using approved procedures",
        "Complete operational documentation accurately",
    ],
}


def _pick(values: list[Any] | tuple[Any, ...], index: int) -> Any:
    return values[index % len(values)]


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _truncate(value: str, length: int | None) -> str:
    return value if not length else value[:length]


def _stable_uuid(table: str, column: str, index: int) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"jai-school/{table}/{column}/{index}")


def _allowed_values(inspector, table_name: str) -> dict[str, list[str]]:
    """Extract string alternatives from PostgreSQL CHECK constraints."""
    result: dict[str, list[str]] = {}
    for constraint in inspector.get_check_constraints(table_name, schema="public"):
        sql = constraint.get("sqltext") or ""
        literals = re.findall(r"'((?:[^']|'')*)'", sql)
        if not literals:
            continue
        for column in inspector.get_columns(table_name, schema="public"):
            name = column["name"]
            if re.search(rf"\b{re.escape(name)}\b", sql):
                clean = [value.replace("''", "'") for value in literals]
                # Ignore literals that only belong to casts or date expressions.
                clean = [v for v in clean if v and v.lower() not in {"utc", "day"}]
                if clean:
                    result.setdefault(name, clean)
    return result


def _title(table: str, index: int) -> str:
    if table in TABLE_LABELS:
        return _pick(TABLE_LABELS[table], index)
    if table == "departments":
        return _pick(DEPARTMENTS, index)
    if table == "programs":
        return _pick(PROGRAMS, index)
    if table == "academic_years":
        return f"{2024 + index}/{2025 + index}"
    if table == "semesters":
        return _pick(["Fall 2026", "Spring 2027", "Summer 2027"], index)
    if "course" in table:
        return _pick(COURSES, index)
    if "aircraft" in table:
        return _pick(AIRCRAFT, index)
    if "ticket" in table:
        return _pick(
            [
                "Learning portal access request",
                "Classroom projector connectivity issue",
                "Password reset assistance",
                "Training tablet software update",
            ],
            index,
        )
    if "request" in table:
        return _pick(
            [
                "Flight schedule adjustment",
                "Additional simulator practice",
                "Course material access",
                "Training record review",
            ],
            index,
        )
    if "faq" in table:
        return _pick(
            [
                "How do I view my training schedule?",
                "Where can I download course materials?",
                "How are attendance records approved?",
                "How do I contact my instructor?",
                "When are assessment results published?",
            ],
            index,
        )
    return f"{table.replace('_', ' ').title()} {index + 1}"


def _string_value(table: str, column: str, index: int, length: int | None) -> str:
    title = _title(table, index)
    name = _pick(NAMES, index)
    lower = column.lower()

    if table == "currencies_master" and lower == "name":
        value = _pick(CURRENCIES, index)[0]
    elif table == "currencies_master" and lower == "code":
        value = _pick(CURRENCIES, index)[1]
    elif table == "programs" and lower == "degree_level":
        value = _pick(["Professional Diploma", "Higher Diploma", "Professional Certificate"], index)
    elif lower in {"status", "state"} or lower.endswith("_status"):
        value = _pick(STATUSES, index)
    elif lower in {"type", "kind", "category"} or lower.endswith("_type"):
        value = "general"
    elif "email" in lower:
        value = f"{_slug(name).replace('-', '.')}@jai-school.test"
    elif "username" in lower:
        value = _slug(name).replace("-", ".")
    elif "phone" in lower or "mobile" in lower:
        value = f"+97150{1000000 + index:07d}"
    elif lower in {"code", "short_code"} or lower.endswith("_code"):
        prefix = "".join(part[0] for part in table.split("_") if part)[:5].upper()
        value = f"{prefix}-{index + 1:03d}"
    elif "currency" in lower and lower != "currency_id":
        value = _pick(["AED", "USD", "EUR", "GBP", "SAR", "QAR", "OMR", "BHD"], index)
    elif "title" in lower or lower in {"subject", "name", "label", "purpose"} or lower.endswith("_name"):
        value = title if "name" not in lower or "person" not in table else name
    elif "description" in lower or "details" in lower or "notes" in lower:
        value = (
            f"Realistic test record for {title.lower()}, prepared for the "
            "2026 academic and flight-training cycle."
        )
    elif "content" in lower or "message" in lower or "body" in lower:
        value = (
            f"Training update for {title.lower()}. Please review the published "
            "material and contact Academic Affairs if clarification is required."
        )
    elif "path" in lower or "file" in lower:
        value = f"test-data/{_slug(table)}/{index + 1}/training-document.pdf"
    elif "url" in lower or "link" in lower:
        value = f"https://school.test/{_slug(table)}/{index + 1}"
    elif "mime" in lower or "content_type" in lower:
        value = "application/pdf"
    elif "password" in lower or "token_hash" in lower or "secret" in lower:
        value = hashlib.sha256(f"test-only-{table}-{index}".encode()).hexdigest()
    elif "ip" == lower or lower.endswith("_ip"):
        value = f"192.0.2.{10 + index}"
    elif "color" in lower:
        value = _pick(["#1D4ED8", "#047857", "#B45309", "#7C3AED"], index)
    elif "language" in lower:
        value = "English"
    elif "location" in lower or "venue" in lower or "room" in lower:
        value = f"JAI Training Centre - Room {201 + index}"
    elif lower.endswith("_id"):
        value = str(index + 1)
    elif "rank" in lower:
        value = _pick(["CADET", "INSTRUCTOR", "CAPTAIN", "MAJOR"], index)
    else:
        value = f"{table.replace('_', ' ').title()} {column.replace('_', ' ')} {index + 1}"
    return _truncate(value, length)


def _json_value(table: str, column: str, index: int) -> Any:
    lower = column.lower()
    if any(word in lower for word in ("ids", "recipients", "members", "items")):
        return []
    if "answers" in lower:
        return {"overall": "Meets expectations", "score": 85}
    if "metadata" in lower or "config" in lower or "settings" in lower:
        return {"source": "synthetic-seed", "environment": "test", "verified": True}
    if "payload" in lower or "data" in lower:
        return {"title": _title(table, index), "status": "active"}
    return {}


def _regular_value(table, column, index: int, allowed: dict[str, list[str]]) -> Any:
    name = column.name
    lower = name.lower()
    type_ = column.type

    # PostgreSQL reflection reports pgvector as NullType unless its dialect
    # adapter is registered. The text representation is accepted by pgvector.
    if lower == "embedding":
        return "[" + ",".join([f"{0.001 * ((index % 5) + 1):.3f}"] * 1024) + "]"
    if name in allowed:
        return _pick(allowed[name], index)
    if isinstance(type_, Enum) and type_.enums:
        return _pick(type_.enums, index)
    if isinstance(type_, (PGUUID,)):
        return _stable_uuid(table.name, name, index)
    if isinstance(type_, Boolean):
        if any(word in lower for word in ("deleted", "revoked", "expired", "archived", "failed")):
            return False
        return True
    if isinstance(type_, DateTime):
        if "end" in lower or "expiry" in lower or "due" in lower:
            return NOW + timedelta(days=30 + index)
        if "start" in lower or "scheduled" in lower:
            return NOW + timedelta(days=index)
        return NOW - timedelta(days=index)
    if isinstance(type_, Date):
        if table.name == "academic_years":
            year = 2024 + index
            return date(year + (1 if "end" in lower else 0), 6 if "end" in lower else 9, 30 if "end" in lower else 1)
        if "end" in lower or "expiry" in lower or "due" in lower:
            return TODAY + timedelta(days=90 + index)
        if "start" in lower:
            return TODAY + timedelta(days=index)
        return TODAY - timedelta(days=index)
    if isinstance(type_, Time):
        return time(hour=8 + (index % 8), minute=30)
    if isinstance(type_, (Integer, BigInteger, SmallInteger)):
        if table.name == "sections" and lower == "max_students":
            return 24
        if "year" in lower:
            return 2026 + index
        if "month" in lower:
            return (index % 12) + 1
        if "day" in lower:
            return (index % 28) + 1
        if "duration" in lower or "minutes" in lower:
            return 60
        if "max" in lower or "total" in lower:
            return 100
        if "score" in lower or "grade" in lower or "percent" in lower:
            return 85 - index
        if "attempt" in lower or "version" in lower or "order" in lower or "index" in lower:
            return index + 1
        return index + 1
    if isinstance(type_, (Numeric, Float)):
        if "max" in lower or "total" in lower:
            return Decimal("100.00")
        if "score" in lower or "grade" in lower or "percent" in lower:
            return Decimal(str(85 - index))
        if "latitude" in lower:
            return Decimal("24.4539")
        if "longitude" in lower:
            return Decimal("54.3773")
        return Decimal(str(index + 1))
    if isinstance(type_, ARRAY):
        return []
    if isinstance(type_, JSON) or "JSON" in type(type_).__name__.upper():
        return _json_value(table.name, name, index)
    if isinstance(type_, LargeBinary):
        return f"synthetic-{table.name}-{index}".encode()
    if isinstance(type_, (String, Text)):
        return _string_value(table.name, name, index, getattr(type_, "length", None))

    type_name = type(type_).__name__.lower()
    if "vector" in type_name:
        dimensions = getattr(type_, "dim", None) or 1024
        return [0.001 * ((index % 5) + 1)] * dimensions
    if "inet" in type_name:
        return f"192.0.2.{10 + index}"
    if "tsvector" in type_name:
        return None
    return _string_value(table.name, name, index, getattr(type_, "length", None))


def _foreign_key_values(conn, constraint, index: int) -> dict[str, Any] | None:
    referred_columns = [element.column for element in constraint.elements]
    local_columns = [element.parent for element in constraint.elements]
    referred_table = referred_columns[0].table
    stmt = select(*referred_columns).order_by(*referred_columns).offset(index).limit(1)
    row = conn.execute(stmt).first()
    if row is None and index:
        row = conn.execute(select(*referred_columns).order_by(*referred_columns).limit(1)).first()
    if row is None:
        return None
    return {local.name: row[position] for position, local in enumerate(local_columns)}


def _build_row(conn, table, inspector, index: int) -> tuple[dict[str, Any] | None, str | None]:
    allowed = _allowed_values(inspector, table.name)
    values: dict[str, Any] = {}

    for constraint in table.foreign_key_constraints:
        resolved = _foreign_key_values(conn, constraint, index)
        required = any(not element.parent.nullable for element in constraint.elements)
        if resolved is None:
            if required:
                return None, f"referenced table empty for {constraint}"
            continue
        values.update(resolved)

    for column in table.columns:
        if column.name in values:
            continue
        if column.computed is not None or column.identity is not None:
            continue
        if column.primary_key and (column.autoincrement is True or column.autoincrement == "auto"):
            if isinstance(column.type, (Integer, BigInteger, SmallInteger)):
                continue
        if column.server_default is not None:
            continue

        # Populate required values and useful nullable business fields. Nullable
        # self-references and audit foreign keys are intentionally left alone.
        if column.foreign_keys:
            continue
        value = _regular_value(table, column, index, allowed)
        if value is None and not column.nullable:
            return None, f"no value generator for required column {column.name}"
        if value is not None:
            values[column.name] = value

    if table.name == "requests":
        # Database constraint requires exactly one routing mechanism. A concrete
        # seeded recipient is more useful than a recipient pool for UI testing.
        values.pop("recipient_pool", None)
        values.pop("return_reason", None)
        values.pop("viewed_at", None)
        values.pop("resolved_at", None)
        values.pop("overdue_notified_at", None)
    return values, None


def _row_count(conn, table) -> int:
    return conn.execute(select(func.count()).select_from(table)).scalar_one()


def _polish_generated_records(conn, metadata: MetaData) -> None:
    """Upgrade labels created by earlier versions without touching real data."""

    for table_name, labels in TABLE_LABELS.items():
        table = metadata.tables.get(f"public.{table_name}")
        if table is None:
            continue
        label_column = next(
            (table.columns.get(name) for name in ("label", "name", "title") if table.columns.get(name) is not None),
            None,
        )
        if label_column is None:
            continue
        primary_key = list(table.primary_key.columns)[0]
        rows = conn.execute(select(primary_key, label_column).order_by(primary_key)).all()
        generic_prefix = table_name.replace("_", " ").title()
        for index, (row_id, current_label) in enumerate(rows):
            if isinstance(current_label, str) and current_label.startswith(generic_prefix):
                conn.execute(
                    table.update()
                    .where(primary_key == row_id)
                    .values({label_column.name: _pick(labels, index)})
                )

    simple_names = {
        "academic_years": [_title("academic_years", i) for i in range(3)],
        "departments": DEPARTMENTS,
        "programs": PROGRAMS,
        "semesters": [_title("semesters", i) for i in range(3)],
    }
    for table_name, names in simple_names.items():
        table = metadata.tables[f"public.{table_name}"]
        primary_key = list(table.primary_key.columns)[0]
        for index, row in enumerate(
            conn.execute(select(primary_key, table.c.name).order_by(primary_key)).all()
        ):
            row_id, current_name = row
            if isinstance(current_name, str) and current_name.startswith(table_name.replace("_", " ").title()):
                updates: dict[str, Any] = {"name": _pick(names, index)}
                if table_name == "academic_years":
                    year = 2024 + index
                    updates.update(
                        start_date=date(year, 9, 1),
                        end_date=date(year + 1, 6, 30),
                    )
                elif table_name == "programs":
                    updates["degree_level"] = _pick(
                        ["Professional Diploma", "Higher Diploma", "Professional Certificate"],
                        index,
                    )
                    updates["total_credits"] = _pick([120, 96, 36], index)
                conn.execute(table.update().where(primary_key == row_id).values(**updates))

    currency_table = metadata.tables["public.currencies_master"]
    for index, row in enumerate(
        conn.execute(
            select(currency_table.c.id, currency_table.c.name, currency_table.c.code)
            .order_by(currency_table.c.id)
        ).all()
    ):
        row_id, current_name, current_code = row
        if str(current_name).startswith("Currencies Master") and str(current_code).startswith("CM-"):
            name, code = _pick(CURRENCIES, index)
            conn.execute(
                currency_table.update()
                .where(currency_table.c.id == row_id)
                .values(name=name, code=code)
            )

    request_table = metadata.tables["public.requests"]
    request_rows = conn.execute(
        select(request_table.c.id, request_table.c.purpose).order_by(request_table.c.created_at, request_table.c.id)
    ).all()
    for index, (request_id, purpose) in enumerate(request_rows):
        if isinstance(purpose, str) and purpose.startswith("Requests purpose"):
            conn.execute(
                request_table.update()
                .where(request_table.c.id == request_id)
                .values(
                    purpose=_title("requests", index),
                    return_reason=None,
                    viewed_at=None,
                    resolved_at=None,
                    overdue_notified_at=None,
                )
            )

    section_table = metadata.tables["public.sections"]
    conn.execute(
        section_table.update()
        .where(section_table.c.max_students == 100)
        .where(section_table.c.code.like("S-%"))
        .values(max_students=24)
    )


def seed() -> tuple[list[str], dict[str, str]]:
    ischema_names.setdefault("vector", Vector)
    metadata = MetaData()
    metadata.reflect(bind=engine, schema="public")
    inspector = inspect(engine)

    seeded: list[str] = []
    failures: dict[str, str] = {}
    with engine.begin() as conn:
        pending = {
            table.name: table
            for table in metadata.sorted_tables
            if table.name != "alembic_version" and _row_count(conn, table) == 0
        }

        # Multiple passes allow parent tables to be created before children even
        # when SQLAlchemy reports dependency cycles.
        for _pass in range(len(pending) + 2):
            if not pending:
                break
            progressed = False
            for table_name, table in list(pending.items()):
                target = TARGET_ROWS.get(table_name, 1)
                table_error: str | None = None
                inserted = 0
                for index in range(target):
                    row, blocked = _build_row(conn, table, inspector, index)
                    if blocked:
                        table_error = blocked
                        break
                    try:
                        with conn.begin_nested():
                            conn.execute(table.insert().values(**row))
                        inserted += 1
                    except Exception as exc:  # keep diagnostics for the final report
                        table_error = str(exc).splitlines()[0]
                        break

                if inserted:
                    seeded.append(table_name)
                    pending.pop(table_name)
                    failures.pop(table_name, None)
                    progressed = True
                    logger.info("Seeded %-65s rows=%d", table_name, inserted)
                elif table_error:
                    failures[table_name] = table_error
            if not progressed:
                break

        for table_name in pending:
            failures.setdefault(table_name, "unresolved dependency or constraint")

        _polish_generated_records(conn, metadata)

    return seeded, failures


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    seeded, failures = seed()
    print(f"\nSeeded {len(seeded)} previously empty tables.")
    if failures:
        print(f"Could not seed {len(failures)} tables:")
        for table, reason in sorted(failures.items()):
            print(f"  - {table}: {reason}")
        raise SystemExit(1)
    print("All application tables now contain representative test data.")


if __name__ == "__main__":
    main()
