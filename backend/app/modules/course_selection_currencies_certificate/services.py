from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import inspect as sa_inspect

from app.core.config import settings
from app.modules.course.models import CourseInstance
from app.modules.currencies_certificate.models import (
    CurrencyMaster,
    MasterCourseCurrency,
    MasterCourseCertificate,
    FlightTaskMaster,
)
from app.modules.currencies_certificate.certificate_services import (
    _validate_pdf,
)

from .models import (
    CourseSelectionInfoCurrencySelected,
    CourseSelectionInfoCertificate,
    CourseSelectionInfoFlightPackage,
    CourseSelectionInfoFlightPackageTask,
    CourseSelectionInfoTaskAssociation,
    CourseSelectionInfoTaskAssociationEO,
    CourseSelectionInfoTaskAssociationCurrency,
    CourseSelectionInfoFlightPackAssociation,
    CourseSelectionInfoFlightPackAssociationLesson,
)

logger = logging.getLogger(__name__)

# Audit columns that must not be copied during cloning.
_AUDIT_COLS = frozenset({"created_at", "updated_at", "created_by_id", "updated_by_id", "id"})

# Mapping: (relationship name on CourseMaster, target instance class, extra cols to exclude)
_SEED_TABS: tuple[tuple[str, type, frozenset[str]], ...] = (
    ("master_course_currencies", CourseSelectionInfoCurrencySelected, frozenset({"course_master_id"})),
    ("master_course_certificates", CourseSelectionInfoCertificate, frozenset({"course_master_id"})),
)


# ---------------------------------------------------------------------------
# Deep clone — mirrors course_selection_info.services helper
# ---------------------------------------------------------------------------

def _clone_to_instance(obj, user_id: int, *, exclude_cols: frozenset[str], target_cls=None):
    """Recursively clone a master row into the matching instance mirror class.

    Uses ``sqlalchemy.inspect`` to read column values dynamically — skips PK,
    audit columns, and any explicitly excluded columns.
    """
    mapper = sa_inspect(obj).mapper
    pk_cols = {c.name for c in mapper.primary_key}

    data: dict[str, object] = {}
    for col in mapper.columns.keys():
        if col in pk_cols or col in _AUDIT_COLS or col in exclude_cols:
            continue
        data[col] = getattr(obj, col)

    cls = target_cls if target_cls else type(obj)
    new = cls(**data)

    if hasattr(new, "created_by_id"):
        new.created_by_id = user_id
    if hasattr(new, "updated_by_id"):
        new.updated_by_id = user_id

    for rel in mapper.relationships:
        if not rel.cascade.delete_orphan:
            continue
        remote_cols = frozenset(c.name for c in rel.remote_side)
        value = getattr(obj, rel.key)
        if rel.uselist:
            for child in value:
                getattr(new, rel.key).append(
                    _clone_to_instance(child, user_id, exclude_cols=remote_cols)
                )
        elif value is not None:
            setattr(new, rel.key, _clone_to_instance(value, user_id, exclude_cols=remote_cols))
    return new


# ---------------------------------------------------------------------------
# Instance helpers
# ---------------------------------------------------------------------------

def get_or_raise_instance(db: Session, course_instance_id: int) -> CourseInstance:
    course = db.get(CourseInstance, course_instance_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course selection not found")
    return course


def get_completion(course: CourseInstance) -> int:
    return course.currencies_certificate_completion


def set_completion(db: Session, course: CourseInstance, tab: str, complete: bool) -> int:
    """Toggle completion status for a currencies-cert sub-tab."""
    if tab not in ("currencies", "certificate"):
        raise HTTPException(status_code=400, detail="tab must be 'currencies' or 'certificate'")

    if not complete and course.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )

    current = course.currencies_certificate_completion or 0
    currencies_done = current in (60, 100)
    cert_done = current in (40, 100)

    if tab == "currencies":
        currencies_done = complete
    else:
        cert_done = complete

    new_completion = (60 if currencies_done else 0) + (40 if cert_done else 0)
    course.currencies_certificate_completion = new_completion
    db.commit()
    return new_completion


# ---------------------------------------------------------------------------
# Read-only catalog
# ---------------------------------------------------------------------------

def get_available_currencies(db: Session) -> list[dict]:
    """Return all currencies from the master list (shared with master)."""
    return [
        dict(id=c.id, name=c.name)
        for c in db.query(CurrencyMaster).order_by(CurrencyMaster.id).all()
    ]


# ---------------------------------------------------------------------------
# Selected currencies (instance-level CRUD)
# ---------------------------------------------------------------------------

def get_selected_currencies(db: Session, course_instance_id: int) -> list[dict]:
    """Return all selected currencies for this instance."""
    get_or_raise_instance(db, course_instance_id)
    return [
        dict(id=r.id, course_instance_id=r.course_instance_id, currency_master_id=r.currency_master_id)
        for r in db.query(CourseSelectionInfoCurrencySelected)
        .filter(CourseSelectionInfoCurrencySelected.course_instance_id == course_instance_id)
        .order_by(CourseSelectionInfoCurrencySelected.currency_master_id)
        .all()
    ]


def save_selected_currencies(
    db: Session,
    course_instance_id: int,
    currency_ids: list[int],
) -> list[dict]:
    """Update selected currencies for this instance (replace all)."""
    get_or_raise_instance(db, course_instance_id)

    existing = db.query(CourseSelectionInfoCurrencySelected).filter_by(
        course_instance_id=course_instance_id
    ).all()
    existing_ids = {r.currency_master_id for r in existing}
    new_ids = set(currency_ids)

    ids_to_keep = existing_ids & new_ids
    ids_to_add = new_ids - existing_ids

    if existing_ids - new_ids:
        db.query(CourseSelectionInfoCurrencySelected).filter(
            CourseSelectionInfoCurrencySelected.course_instance_id == course_instance_id,
            ~CourseSelectionInfoCurrencySelected.currency_master_id.in_(list(ids_to_keep)),
        ).delete(synchronize_session=False)

    for currency_id in ids_to_add:
        db.add(CourseSelectionInfoCurrencySelected(
            course_instance_id=course_instance_id,
            currency_master_id=currency_id,
        ))
    db.commit()
    return [
        dict(id=r.id, course_instance_id=r.course_instance_id, currency_master_id=r.currency_master_id)
        for r in db.query(CourseSelectionInfoCurrencySelected)
        .filter(CourseSelectionInfoCurrencySelected.course_instance_id == course_instance_id)
        .all()
    ]


# ---------------------------------------------------------------------------
# Certificate (instance-level)
# ---------------------------------------------------------------------------

def get_certificate(db: Session, course_instance_id: int) -> CourseSelectionInfoCertificate | None:
    return (
        db.query(CourseSelectionInfoCertificate)
        .filter(CourseSelectionInfoCertificate.course_instance_id == course_instance_id)
        .first()
    )


def _build_certificate_url(course_instance_id: int, storage_key: str) -> str:
    return f"/api/v1/course-selection-currencies/{course_instance_id}/certification-files/{storage_key}"


def get_certificate_url(db: Session, course_instance_id: int) -> str | None:
    cert = get_certificate(db, course_instance_id)
    if cert and cert.storage_key:
        return _build_certificate_url(course_instance_id, cert.storage_key)
    return None


def _get_material_dir() -> Path:
    val = settings.MATERIAL_UPLOAD_DIR
    return Path(val) if not isinstance(val, Path) else val


def upload_certificate(
    db: Session,
    course_instance_id: int,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    user_id: int,
) -> dict:
    """Upload a certificate PDF for this instance."""
    _validate_pdf(file_bytes, content_type)
    get_or_raise_instance(db, course_instance_id)

    # Clean up any existing cert row
    db.query(CourseSelectionInfoCertificate).filter_by(
        course_instance_id=course_instance_id,
    ).delete(synchronize_session=False)
    db.flush()

    now = datetime.now(timezone.utc)
    year_month = Path(str(now.year)) / f"{now.month:02d}"
    material_dir = _get_material_dir()
    dest_dir = material_dir / year_month
    dest_dir.mkdir(parents=True, exist_ok=True)

    ext = ".pdf"
    perm_file = dest_dir / f"{uuid.uuid4()}{ext}"
    perm_file.write_bytes(file_bytes)

    storage_key = str(perm_file.relative_to(material_dir)).replace("\\", "/")

    new_cert = CourseSelectionInfoCertificate(
        course_instance_id=course_instance_id,
        storage_key=storage_key,
        filename=filename,
        content_type=content_type,
        file_size=len(file_bytes),
        created_by_id=user_id,
    )
    db.add(new_cert)
    db.commit()
    db.refresh(new_cert)

    return {
        "storage_key": storage_key,
        "certificateUrl": _build_certificate_url(course_instance_id, storage_key),
    }


def _all_seeded(course: CourseInstance) -> bool:
    return (
        course.currencies_cert_seeded
        and course.flight_package_seeded
        and course.task_association_seeded
        and course.flight_pack_association_seeded
    )


# ---------------------------------------------------------------------------
# Seeding from master — mirrors course_selection_info.services pattern
# ---------------------------------------------------------------------------


def seed_from_master(
    db: Session,
    course: CourseInstance,
    user_id: int | None = None,
) -> None:
    """Copy the master's selected currencies and certificate into this instance.

    Idempotent via ``course.currencies_cert_seeded``. Mirrors
    ``seed_course_info_from_master`` in ``course_selection_info.services``:
    iterates over a tab-mapping, deep-clones each row into the instance's own
    tables, copies the master's completion value, sets the seeded flag,
    then commits.
    """
    db.refresh(course)

    # Each sub-tab seeds independently so adding new sub-tabs (Flight Package,
    # Task Association, Flight Pack Association) still copies the master for
    # instances that were already seeded for the original tabs.
    all_seeded = course.currencies_cert_seeded and course.flight_package_seeded and course.task_association_seeded
    if all_seeded:
        return

    master = course.master
    uid = user_id or course.updated_by_id or course.created_by_id

    for _retry in range(3):
        try:
            if master and not course.currencies_cert_seeded:
                for rel_name, target_cls, exclude in _SEED_TABS:
                    master_rows = getattr(master, rel_name, None)
                    if master_rows is None:
                        continue
                    for m_obj in list(master_rows):
                        cloned = _clone_to_instance(
                            m_obj, uid, exclude_cols=exclude, target_cls=target_cls
                        )
                        cloned.course_instance_id = course.id
                        db.add(cloned)

            if master and not course.flight_package_seeded:
                _seed_flight_packages(db, course, master)

            if master and not course.task_association_seeded:
                _seed_task_associations(db, course, master)

            course.currencies_cert_seeded = True
            course.flight_package_seeded = True
            course.task_association_seeded = True
            db.commit()
            return
        except Exception:
            db.rollback()
            db.expire_all()
            db.refresh(course)
            if _all_seeded(course):
                return
    else:
        logger.exception("Seed failed after 3 attempts for course instance %s", course.id)
        raise


def _seed_flight_packages(db: Session, course: CourseInstance, master) -> None:
    """Deep-copy the master's flight packages (and their task rows) into the
    instance's own mirror tables, preserving order."""
    for m_pkg in list(master.master_course_flight_packages):
        new_pkg = CourseSelectionInfoFlightPackage(
            course_instance_id=course.id,
            name=m_pkg.name,
            position=m_pkg.position,
        )
        for m_task in list(m_pkg.tasks):
            new_pkg.tasks.append(CourseSelectionInfoFlightPackageTask(
                task_master_id=m_task.task_master_id,
                position=m_task.position,
            ))
        db.add(new_pkg)


def _seed_task_associations(db: Session, course: CourseInstance, master) -> None:
    """Deep-copy the master's task associations (and their EO / currency links)
    into the instance's own mirror tables, preserving order."""
    for m_assoc in list(master.master_course_task_associations):
        new_assoc = CourseSelectionInfoTaskAssociation(
            course_instance_id=course.id,
            task_master_id=m_assoc.task_master_id,
            position=m_assoc.position,
        )
        for m_eo in list(m_assoc.enabling_objectives):
            new_assoc.enabling_objectives.append(CourseSelectionInfoTaskAssociationEO(
                enabling_objective_id=m_eo.enabling_objective_id,
            ))
        for m_cur in list(m_assoc.currencies):
            new_assoc.currencies.append(CourseSelectionInfoTaskAssociationCurrency(
                currency_master_id=m_cur.currency_master_id,
            ))
        db.add(new_assoc)


def seed_flight_pack_associations(
    db: Session, course: CourseInstance, user_id: int | None = None,
) -> None:
    """Lazily seed FPA from master when user opens the FPA tab for the first time.

    Requires that course_info_lesson_creation is seeded (lessons exist) so
    that master->instance lesson mapping works. If not yet seeded, seeds it
    automatically since FPA depends on those lesson IDs.
    """
    if course.flight_pack_association_seeded:
        return

    db.refresh(course)
    master = course.master
    if master is None:
        return

    # Course Information (incl. lessons) must exist -- seed it if not.
    if not course.course_info_seeded:
        from app.modules.course_selection_info import services as csinfo
        csinfo.seed_course_info_from_master(db, course)

    # Package mapping: snapshot instance packages for name match.
    instance_pkgs = db.query(CourseSelectionInfoFlightPackage).filter(
        CourseSelectionInfoFlightPackage.course_instance_id == course.id,
    ).order_by(CourseSelectionInfoFlightPackage.position).all()

    if not len(instance_pkgs) > 0:
        return

    # master_pkg.id -> instance_pkg.id map.
    master_to_inst_pkg: dict[int, int] = {}
    for m_pkg in master.master_course_flight_packages:
        for i_pkg in instance_pkgs:
            if i_pkg.name == m_pkg.name and i_pkg.id not in master_to_inst_pkg.values():
                master_to_inst_pkg[m_pkg.id] = i_pkg.id
                break

    # master lesson id -> instance lesson id map.
    from app.modules.course_selection_info import services as csi_services
    lesson_map = csi_services.master_to_instance_lesson_ids(course)

    # Copy FPA associations including their lesson links.
    for m_assoc in list(master.master_course_flight_pack_associations):
        inst_pkg_id = master_to_inst_pkg.get(m_assoc.package_id)
        if inst_pkg_id is None:
            continue
        new_assoc = CourseSelectionInfoFlightPackAssociation(
            course_instance_id=course.id,
            package_id=inst_pkg_id,
            position=m_assoc.position,
        )
        db.add(new_assoc)
        db.flush()
        for m_lesson in sorted(m_assoc.lessons, key=lambda l: l.position):
            inst_lesson_id = lesson_map.get(m_lesson.lesson_id)
            if inst_lesson_id is None:
                continue
            new_lesson = CourseSelectionInfoFlightPackAssociationLesson(
                association_id=new_assoc.id,
                lesson_id=inst_lesson_id,
            )
            db.add(new_lesson)

    course.flight_pack_association_seeded = True

    for _retry in range(3):
        try:
            db.commit()
            return
        except Exception:
            db.rollback()
            db.expire_all()
            db.refresh(course)
            if course.flight_pack_association_seeded:
                return
    else:
        logger.exception("Seed FPA failed after 3 attempts for course instance %s", course.id)
        raise


def currencies_cert_modified(db: Session, course: CourseInstance) -> bool:
    """True when instance content for the Currencies & Certificate category
    differs from the master. Covers all four sub-tabs: Currencies, Certificate,
    Flight Package and Task Association (the detail page shows a single
    "Modified" badge for the whole category)."""
    master = course.master
    if master is None:
        return False

    # ── Currencies + Certificate ──
    if course.currencies_cert_seeded:
        master_cids = set(r.currency_master_id for r in master.master_course_currencies)
        inst_cids = set(r.currency_master_id for r in course.selected_currencies)
        if master_cids != inst_cids:
            return True

        # Compare certificate (instance is scalar, master is a list of zero or one).
        inst_cert = course.certificate
        m_certs = list(master.master_course_certificates)
        m_key = m_certs[0].storage_key if m_certs else None
        i_key = inst_cert.storage_key if inst_cert else None
        if m_key != i_key:
            return True

    # ── Flight Package ──
    if course.flight_package_seeded and _flight_packages_differ(master, course):
        return True

    # ── Task Association ──
    if course.task_association_seeded and _task_associations_differ(master, course):
        return True

    # ── Flight Pack Association ──
    if course.flight_pack_association_seeded and _flight_pack_associations_differ(master, course):
        return True

    return False


def _flight_packages_differ(master, course: CourseInstance) -> bool:
    """Compare instance flight packages against the master, order-sensitively."""
    def snapshot(packages) -> list:
        return [
            (p.name or "", [t.task_master_id for t in p.tasks])
            for p in packages
        ]

    return snapshot(master.master_course_flight_packages) != snapshot(course.flight_packages)


def _task_associations_differ(master, course: CourseInstance) -> bool:
    """Compare instance task associations against the master, order-sensitively."""
    def snapshot(associations) -> list:
        return [
            (
                a.task_master_id,
                frozenset(e.enabling_objective_id for e in a.enabling_objectives),
                frozenset(c.currency_master_id for c in a.currencies),
            )
            for a in associations
        ]

    return snapshot(master.master_course_task_associations) != snapshot(course.task_associations)


def _flight_pack_associations_differ(
    master, course: CourseInstance,
) -> bool:
    """Compare instance FPA against the master by package name and lesson titles.

    We compare the set of package names and, per package, the sorted list of
    lesson titles linked.
    """
    def snapshot(fpa_list):
        buckets = {}
        for a in fpa_list:
            name = a.package.name if a.package else ""
            lesson_titles = []
            for l in a.lessons:
                if l.lesson:
                    lt = l.lesson.lesson_title if l.lesson.lesson_title else f"Lesson {l.lesson.order_index + 1}"
                else:
                    lt = ""
                lesson_titles.append(lt)
            buckets.setdefault(name, set()).update(lesson_titles)
        return [(name, sorted(lessons)) for name, lessons in sorted(buckets.items())]

    return snapshot(master.master_course_flight_pack_associations) != snapshot(
        course.flight_pack_associations
    )


# ---------------------------------------------------------------------------
# Flight packages (instance-level CRUD) — mirrors currencies_certificate.services
# ---------------------------------------------------------------------------

def _serialize_flight_package(pkg: CourseSelectionInfoFlightPackage) -> dict:
    return dict(
        id=pkg.id,
        name=pkg.name,
        tasks=[
            dict(
                id=t.id,
                task_master_id=t.task_master_id,
                task_no=t.task.task_no if t.task else "",
                task_description=t.task.task_description if t.task else "",
            )
            for t in pkg.tasks
        ],
    )


def get_flight_packages(db: Session, course_instance_id: int) -> list[dict]:
    """Return all flight packages (with their tasks) for this instance."""
    packages = (
        db.query(CourseSelectionInfoFlightPackage)
        .filter(CourseSelectionInfoFlightPackage.course_instance_id == course_instance_id)
        .order_by(CourseSelectionInfoFlightPackage.position, CourseSelectionInfoFlightPackage.id)
        .all()
    )
    return [_serialize_flight_package(p) for p in packages]


def save_flight_packages(db: Session, course_instance_id: int, packages: list) -> list[dict]:
    """Upsert flight package names while preserving existing IDs."""
    get_or_raise_instance(db, course_instance_id)

    # Validate every referenced task master id exists up-front.
    referenced_ids = {t.task_master_id for pkg in packages for t in pkg.tasks}
    if referenced_ids:
        found = {
            r.id for r in db.query(FlightTaskMaster.id)
            .filter(FlightTaskMaster.id.in_(referenced_ids)).all()
        }
        missing = referenced_ids - found
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown flight task master id(s): {sorted(missing)}",
            )

    all_persisted = db.query(CourseSelectionInfoFlightPackage).filter(
        CourseSelectionInfoFlightPackage.course_instance_id == course_instance_id,
    ).all()
    if not all_persisted:
        all_persisted = []

    existing_map = {p.name.strip(): p for p in all_persisted}
    used_ids = set()
    new_ids = []
    new_pkgs_to_map = {}

    for pkg_pos, pkg in enumerate(packages):
        name = (pkg.name or "").strip()
        existing = existing_map.get(name)
        if existing:
            existing.name = name
            existing.position = pkg_pos
            used_ids.add(existing.id)
            new_ids.append(existing.id)
        else:
            new_pkg = CourseSelectionInfoFlightPackage(
                course_instance_id=course_instance_id,
                name=name,
                position=pkg_pos,
            )
            db.add(new_pkg)
            db.flush()
            used_ids.add(new_pkg.id)
            new_ids.append(new_pkg.id)
            new_pkgs_to_map[name] = new_pkg.id

    for old_pkg in all_persisted:
        if old_pkg.id not in used_ids:
            db.query(CourseSelectionInfoFlightPackageTask).filter(
                CourseSelectionInfoFlightPackageTask.package_id == old_pkg.id,
            ).delete(synchronize_session=False)
            db.delete(old_pkg)

    db.flush()

    active = db.query(CourseSelectionInfoFlightPackage).filter(
        CourseSelectionInfoFlightPackage.course_instance_id == course_instance_id,
    ).all()
    pkg_map = {p.name.strip(): p for p in active}

    for pkg_pos, pkg in enumerate(packages):
        name = (pkg.name or "").strip()
        pkg_obj = pkg_map.get(name)
        if not pkg_obj:
            pkg_obj = next((p for p in active if p.id == new_pkgs_to_map.get(name)))

        clean_task_ids = sorted({
            (t.task_master_id or 0) for t in (pkg.tasks or []) if t.task_master_id
        })
        current_tasks = db.query(CourseSelectionInfoFlightPackageTask).filter(
            CourseSelectionInfoFlightPackageTask.package_id == pkg_obj.id,
        ).all()
        current_task_ids_sorted = sorted(
            (t.task_master_id or 0) for t in current_tasks
        )
        to_remove = set(current_tasks)
        for new_task in clean_task_ids:
            matched = any(t.task_master_id == new_task for t in current_tasks)
            if matched:
                to_remove.discard(next(t for t in current_tasks if t.task_master_id == new_task))
        for to_del in to_remove:
            db.delete(to_del)
        for task_pos_idx, task_id in enumerate(clean_task_ids):
            existing_task = next(
                (t for t in current_tasks if t.task_master_id == task_id), None
            )
            if existing_task:
                existing_task.position = task_pos_idx
            else:
                db.add(CourseSelectionInfoFlightPackageTask(
                    package_id=pkg_obj.id,
                    task_master_id=task_id,
                    position=task_pos_idx,
                ))

    db.commit()
    return get_flight_packages(db, course_instance_id)


def get_available_packages(db: Session, course_instance_id: int) -> list[dict]:
    """Flight packages available for FPA association — name only, no tasks."""
    packages = (
        db.query(CourseSelectionInfoFlightPackage)
        .filter(CourseSelectionInfoFlightPackage.course_instance_id == course_instance_id)
        .order_by(CourseSelectionInfoFlightPackage.position, CourseSelectionInfoFlightPackage.id)
        .all()
    )
    return [dict(package_id=p.id, package_name=p.name) for p in packages]


def set_flight_package_status(db: Session, course: CourseInstance, complete: bool) -> int:
    """Toggle completion for the Flight Package sub-tab (0 or 100)."""
    if not complete and course.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    course.flight_package_completion = 100 if complete else 0
    db.commit()
    return course.flight_package_completion


# ---------------------------------------------------------------------------
# Task Association (instance-level CRUD)
# ---------------------------------------------------------------------------

def get_available_tasks(db: Session, course_instance_id: int) -> list[dict]:
    """Tasks selectable for association — the distinct flight tasks already
    added to this instance's flight packages."""
    rows = (
        db.query(FlightTaskMaster.id, FlightTaskMaster.task_no, FlightTaskMaster.task_description)
        .join(CourseSelectionInfoFlightPackageTask, CourseSelectionInfoFlightPackageTask.task_master_id == FlightTaskMaster.id)
        .join(CourseSelectionInfoFlightPackage, CourseSelectionInfoFlightPackage.id == CourseSelectionInfoFlightPackageTask.package_id)
        .filter(CourseSelectionInfoFlightPackage.course_instance_id == course_instance_id)
        .order_by(FlightTaskMaster.task_no, FlightTaskMaster.id)
        .distinct()
        .all()
    )
    return [
        dict(task_master_id=r.id, task_no=r.task_no, task_description=r.task_description)
        for r in rows
    ]


def list_enabling_objectives(db: Session) -> list[dict]:
    """All Enabling Objectives (created in Course Information), as options.

    Mirrors the master service — EOs are a global catalog shared across courses.
    """
    from app.modules.course_info.models import MasterEnablingObjective
    return [
        dict(id=e.id, label=e.label)
        for e in db.query(MasterEnablingObjective).order_by(MasterEnablingObjective.label).all()
    ]


def _serialize_task_association(assoc: CourseSelectionInfoTaskAssociation) -> dict:
    return dict(
        id=assoc.id,
        task_master_id=assoc.task_master_id,
        task_no=assoc.task.task_no if assoc.task else "",
        task_description=assoc.task.task_description if assoc.task else "",
        enabling_objectives=[
            dict(
                enabling_objective_id=eo.enabling_objective_id,
                label=eo.enabling_objective.label if eo.enabling_objective else "",
            )
            for eo in assoc.enabling_objectives
        ],
        currencies=[
            dict(
                currency_master_id=c.currency_master_id,
                name=c.currency.name if c.currency else "",
            )
            for c in assoc.currencies
        ],
    )


def get_task_associations(db: Session, course_instance_id: int) -> list[dict]:
    """Return all task-association records (with EO + currency links) for this instance."""
    associations = (
        db.query(CourseSelectionInfoTaskAssociation)
        .filter(CourseSelectionInfoTaskAssociation.course_instance_id == course_instance_id)
        .order_by(CourseSelectionInfoTaskAssociation.position, CourseSelectionInfoTaskAssociation.id)
        .all()
    )
    return [_serialize_task_association(a) for a in associations]


def save_task_associations(db: Session, course_instance_id: int, associations: list) -> list[dict]:
    """Replace all task associations for this instance (delete + recreate in order)."""
    from app.modules.course_info.models import MasterEnablingObjective

    get_or_raise_instance(db, course_instance_id)

    # The task must be one of this instance's flight-package tasks.
    allowed_task_ids = {t["task_master_id"] for t in get_available_tasks(db, course_instance_id)}
    eo_ids = {eid for a in associations for eid in a.enabling_objective_ids}
    currency_ids = {cid for a in associations for cid in a.currency_master_ids}

    seen_task_ids: set[int] = set()
    for a in associations:
        if a.task_master_id not in allowed_task_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Task {a.task_master_id} is not in this course's flight packages.",
            )
        if a.task_master_id in seen_task_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Task {a.task_master_id} is already associated.",
            )
        seen_task_ids.add(a.task_master_id)

    if eo_ids:
        found = {r.id for r in db.query(MasterEnablingObjective.id).filter(MasterEnablingObjective.id.in_(eo_ids)).all()}
        missing = eo_ids - found
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown enabling objective id(s): {sorted(missing)}")

    if currency_ids:
        found = {r.id for r in db.query(CurrencyMaster.id).filter(CurrencyMaster.id.in_(currency_ids)).all()}
        missing = currency_ids - found
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown currency id(s): {sorted(missing)}")

    db.query(CourseSelectionInfoTaskAssociation).filter(
        CourseSelectionInfoTaskAssociation.course_instance_id == course_instance_id,
    ).delete(synchronize_session=False)
    db.flush()

    for pos, a in enumerate(associations):
        new_assoc = CourseSelectionInfoTaskAssociation(
            course_instance_id=course_instance_id,
            task_master_id=a.task_master_id,
            position=pos,
        )
        db.add(new_assoc)
        db.flush()
        for eid in dict.fromkeys(a.enabling_objective_ids):
            db.add(CourseSelectionInfoTaskAssociationEO(association_id=new_assoc.id, enabling_objective_id=eid))
        for cid in dict.fromkeys(a.currency_master_ids):
            db.add(CourseSelectionInfoTaskAssociationCurrency(association_id=new_assoc.id, currency_master_id=cid))

    db.commit()
    return get_task_associations(db, course_instance_id)


def set_task_association_status(db: Session, course: CourseInstance, complete: bool) -> int:
    """Toggle completion for the Task Association sub-tab (0 or 100)."""
    if not complete and course.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    course.task_association_completion = 100 if complete else 0
    db.commit()
    return course.task_association_completion


# ---------------------------------------------------------------------------
# Flight Pack Association (instance-level CRUD)
# ---------------------------------------------------------------------------

def get_available_lessons(db: Session, course_instance_id: int) -> list[dict]:
    """Lessons selectable for flight-pack association — from this instance's lesson_creation."""
    from app.modules.course_selection_info.models import (
        CourseSelectionInfoLessonCreation,
        CourseSelectionInfoLessonCreationLesson,
    )

    lessons = (
        db.query(CourseSelectionInfoLessonCreationLesson)
        .join(CourseSelectionInfoLessonCreationLesson.lesson_creation)
        .filter(CourseSelectionInfoLessonCreationLesson.lesson_creation.has(
            CourseSelectionInfoLessonCreation.course_instance_id == course_instance_id
        ))
        .order_by(CourseSelectionInfoLessonCreationLesson.order_index, CourseSelectionInfoLessonCreationLesson.id)
        .all()
    )
    return [
        dict(id=l.id, lesson_title=l.lesson_title if l.lesson_title else f"Lesson {l.order_index + 1}")
        for l in lessons
    ]


def _serialize_flight_pack_association(assoc: CourseSelectionInfoFlightPackAssociation) -> dict:
    return dict(
        id=assoc.id,
        package_id=assoc.package_id,
        package_name=assoc.package.name if assoc.package else "",
        lessons=[
            dict(
                lesson_id=l.lesson_id,
                lesson_title=l.lesson.lesson_title if l.lesson else "",
            )
            for l in assoc.lessons
        ],
    )


def get_flight_pack_associations(db: Session, course_instance_id: int) -> list[dict]:
    """Return all flight-pack-association records (with lesson links) for this instance."""
    associations = (
        db.query(CourseSelectionInfoFlightPackAssociation)
        .filter(CourseSelectionInfoFlightPackAssociation.course_instance_id == course_instance_id)
        .order_by(CourseSelectionInfoFlightPackAssociation.position, CourseSelectionInfoFlightPackAssociation.id)
        .all()
    )
    return [_serialize_flight_pack_association(a) for a in associations]


def save_flight_pack_associations(db: Session, course_instance_id: int, associations: list) -> list[dict]:
    """Replace all flight-pack associations for this instance (delete + recreate in order)."""
    from app.modules.course_selection_info.models import CourseSelectionInfoLessonCreationLesson

    get_or_raise_instance(db, course_instance_id)

    # The package must be one of this instance's flight packages.
    allowed_package_ids = {p["package_id"] for p in get_available_packages(db, course_instance_id)}

    seen_package_ids: set[int] = set()
    lesson_ids_set: set[int] = set()
    for a in associations:
        if a.package_id not in allowed_package_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Package {a.package_id} is not in this course's flight packages.",
            )
        if a.package_id in seen_package_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Package {a.package_id} is already associated.",
            )
        seen_package_ids.add(a.package_id)
        lesson_ids_set.update(a.lesson_ids)

    if lesson_ids_set:
        found = {r.id for r in db.query(CourseSelectionInfoLessonCreationLesson.id)
                 .filter(CourseSelectionInfoLessonCreationLesson.id.in_(lesson_ids_set)).all()}
        missing = lesson_ids_set - found
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown lesson id(s): {sorted(missing)}")

    db.query(CourseSelectionInfoFlightPackAssociation).filter(
        CourseSelectionInfoFlightPackAssociation.course_instance_id == course_instance_id,
    ).delete(synchronize_session=False)
    db.flush()

    for pos, a in enumerate(associations):
        new_assoc = CourseSelectionInfoFlightPackAssociation(
            course_instance_id=course_instance_id,
            package_id=a.package_id,
            position=pos,
        )
        db.add(new_assoc)
        db.flush()
        for lid in dict.fromkeys(a.lesson_ids):
            db.add(CourseSelectionInfoFlightPackAssociationLesson(association_id=new_assoc.id, lesson_id=lid))

    db.commit()
    return get_flight_pack_associations(db, course_instance_id)


def set_flight_pack_association_status(db: Session, course: CourseInstance, complete: bool) -> int:
    """Toggle completion for the Flight Pack Association sub-tab (0 or 100)."""
    if not complete and course.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    course.flight_pack_association_completion = 100 if complete else 0
    db.commit()
    return course.flight_pack_association_completion
