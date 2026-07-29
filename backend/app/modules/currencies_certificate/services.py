from datetime import datetime, timezone
from pathlib import Path
import logging
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.core.config import settings
from app.modules.currencies_certificate.models import (
    CurrencyMaster,
    MasterCourseCurrency,
    MasterCourseCertificate,
    MasterCourseFlightPackage,
    MasterCourseFlightPackageTask,
    FlightTaskMaster,
    MasterCourseTaskAssociation,
    MasterCourseTaskAssociationEO,
    MasterCourseTaskAssociationCurrency,
    MasterCourseFlightPackAssociation,
    MasterCourseFlightPackAssociationLesson,
)
from app.modules.currencies_certificate.certificate_services import (
    _validate_pdf,
)
from app.modules.course_master.models import CourseMaster

logger = logging.getLogger(__name__)


def get_available_currencies(db: Session) -> list[dict]:
    """Return all currencies from the master list as dicts."""
    return [
        dict(id=c.id, name=c.name)
        for c in db.query(CurrencyMaster).order_by(CurrencyMaster.id).all()
    ]


def get_master_course_currencies(
    db: Session,
    course_master_id: int,
) -> list[dict]:
    """Return all selected currencies for a given course master as dicts."""
    return [
        dict(id=r.id, course_master_id=r.course_master_id, currency_master_id=r.currency_master_id)
        for r in db.query(MasterCourseCurrency)
        .filter(MasterCourseCurrency.course_master_id == course_master_id)
        .order_by(MasterCourseCurrency.currency_master_id)
        .all()
    ]


def save_master_course_currencies(
    db: Session,
    course_master_id: int,
    currency_ids: list[int],
) -> list[dict]:
    # Build lookup sets
    existing = db.query(MasterCourseCurrency).filter_by(course_master_id=course_master_id).all()
    existing_ids = {mc.currency_master_id for mc in existing}
    new_ids = set(currency_ids)

    ids_to_keep = existing_ids & new_ids
    ids_to_add = new_ids - existing_ids

    # Delete rows no longer selected
    if existing_ids - new_ids:
        db.query(MasterCourseCurrency).filter(
            MasterCourseCurrency.course_master_id == course_master_id,
            ~MasterCourseCurrency.currency_master_id.in_(list(ids_to_keep)),
        ).delete(synchronize_session=False)

    # Insert new rows
    for currency_id in ids_to_add:
        db.add(MasterCourseCurrency(
            course_master_id=course_master_id,
            currency_master_id=currency_id,
        ))
    db.commit()
    return [
        dict(id=r.id, course_master_id=r.course_master_id, currency_master_id=r.currency_master_id)
        for r in db.query(MasterCourseCurrency).filter_by(course_master_id=course_master_id).all()
    ]


def _get_tab_complete(master: CourseMaster, tab: str) -> bool:
    """Check if a specific tab is complete from the stored completion value.
    
    Possible values: 0 (neither), 40 (cert only), 60 (currencies only), 100 (both)
    - currencies tab complete when value is 60 or 100
    - certificate tab complete when value is 40 or 100
    """
    val = master.currencies_certificate_completion
    if tab == "currencies":
        return val in (60, 100)
    elif tab == "certificate":
        return val in (40, 100)
    return False


def set_currencies_cert_tab_status(
    db: Session,
    master: CourseMaster,
    tab: str,
    complete: bool,
    user_id: int,
) -> CourseMaster:
    """Toggle completion status for a single currencies-cert sub-tab."""
    if tab not in ("currencies", "certificate"):
        raise HTTPException(status_code=400, detail="tab must be 'currencies' or 'certificate'")

    if not complete and master.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )

    currencies_done = complete if tab == "currencies" else _get_tab_complete(master, "currencies")
    cert_done = complete if tab == "certificate" else _get_tab_complete(master, "certificate")

    master.currencies_certificate_completion = (60 if currencies_done else 0) + (40 if cert_done else 0)
    master.updated_by_id = user_id
    db.commit()
    db.refresh(master)
    return master


# ---------------------------------------------------------------------------
# Flight packages
# ---------------------------------------------------------------------------

def _serialize_flight_package(pkg: MasterCourseFlightPackage) -> dict:
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


def get_flight_packages(db: Session, course_master_id: int) -> list[dict]:
    """Return all flight packages (with their tasks) for a course master."""
    packages = (
        db.query(MasterCourseFlightPackage)
        .filter(MasterCourseFlightPackage.course_master_id == course_master_id)
        .order_by(MasterCourseFlightPackage.position, MasterCourseFlightPackage.id)
        .all()
    )
    return [_serialize_flight_package(p) for p in packages]


def save_flight_packages(
    db: Session,
    course_master_id: int,
    packages: list,
) -> list[dict]:
    """Upsert flight package names while preserving existing IDs.

    ``packages`` is a list of FlightPackageInput schema objects whose tasks
    reference the shared catalog by ``task_master_id``. Existing packages are
    updated by name; new packages are created with new IDs. Deleted packages
    are removed along with their task links.
    """
    get_or_raise_currencies_master(db, course_master_id)

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

    all_persisted = db.query(MasterCourseFlightPackage).filter(
        MasterCourseFlightPackage.course_master_id == course_master_id,
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
            new_pkg = MasterCourseFlightPackage(
                course_master_id=course_master_id,
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
            db.query(MasterCourseFlightPackageTask).filter(
                MasterCourseFlightPackageTask.package_id == old_pkg.id,
            ).delete(synchronize_session=False)
            db.delete(old_pkg)

    db.flush()

    active = db.query(MasterCourseFlightPackage).filter(
        MasterCourseFlightPackage.course_master_id == course_master_id,
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
        current_tasks = db.query(MasterCourseFlightPackageTask).filter(
            MasterCourseFlightPackageTask.package_id == pkg_obj.id,
        ).all()
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
                db.add(MasterCourseFlightPackageTask(
                    package_id=pkg_obj.id,
                    task_master_id=task_id,
                    position=task_pos_idx,
                ))

    db.commit()
    return get_flight_packages(db, course_master_id)


# ---------------------------------------------------------------------------
# Flight task master (shared catalog)
# ---------------------------------------------------------------------------

def list_flight_task_master(db: Session) -> list[dict]:
    """Return the whole flight-task catalog, ordered by task number."""
    return [
        dict(id=t.id, task_no=t.task_no, task_description=t.task_description)
        for t in db.query(FlightTaskMaster)
        .order_by(FlightTaskMaster.task_no, FlightTaskMaster.id)
        .all()
    ]


def create_flight_task_master(
    db: Session,
    task_no: str,
    task_description: str,
    user_id: int,
) -> dict:
    """Add a task to the shared catalog.

    Both fields are required. Idempotent on the exact (task_no,
    task_description) pair — an existing match is returned rather than
    duplicated.
    """
    clean_no = (task_no or "").strip()
    clean_desc = (task_description or "").strip()
    if not clean_no or not clean_desc:
        raise HTTPException(
            status_code=400,
            detail="Both task_no and task_description are required.",
        )

    existing = (
        db.query(FlightTaskMaster)
        .filter(
            FlightTaskMaster.task_no == clean_no,
            FlightTaskMaster.task_description == clean_desc,
        )
        .first()
    )
    if existing is not None:
        return dict(id=existing.id, task_no=existing.task_no, task_description=existing.task_description)

    task = FlightTaskMaster(task_no=clean_no, task_description=clean_desc, created_by_id=user_id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return dict(id=task.id, task_no=task.task_no, task_description=task.task_description)


def set_flight_package_status(
    db: Session,
    master: CourseMaster,
    complete: bool,
    user_id: int,
) -> CourseMaster:
    """Toggle completion status for the Flight Package sub-tab (0 or 100)."""
    if not complete and master.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    master.flight_package_completion = 100 if complete else 0
    master.updated_by_id = user_id
    db.commit()
    db.refresh(master)
    return master


# ---------------------------------------------------------------------------
# Task Association
# ---------------------------------------------------------------------------

def get_available_tasks(db: Session, course_master_id: int) -> list[dict]:
    """Tasks selectable for association — the distinct flight tasks already
    added to this course master's flight packages."""
    rows = (
        db.query(FlightTaskMaster.id, FlightTaskMaster.task_no, FlightTaskMaster.task_description)
        .join(MasterCourseFlightPackageTask, MasterCourseFlightPackageTask.task_master_id == FlightTaskMaster.id)
        .join(MasterCourseFlightPackage, MasterCourseFlightPackage.id == MasterCourseFlightPackageTask.package_id)
        .filter(MasterCourseFlightPackage.course_master_id == course_master_id)
        .order_by(FlightTaskMaster.task_no, FlightTaskMaster.id)
        .distinct()
        .all()
    )
    return [
        dict(task_master_id=r.id, task_no=r.task_no, task_description=r.task_description)
        for r in rows
    ]


def list_enabling_objectives(db: Session) -> list[dict]:
    """All Enabling Objectives (created in Course Information), as options."""
    # Imported lazily to avoid a circular import with the course_info package.
    from app.modules.course_info.models import MasterEnablingObjective
    return [
        dict(id=e.id, label=e.label)
        for e in db.query(MasterEnablingObjective).order_by(MasterEnablingObjective.label).all()
    ]


def _serialize_task_association(assoc: MasterCourseTaskAssociation) -> dict:
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


def get_task_associations(db: Session, course_master_id: int) -> list[dict]:
    """Return all task-association records (with EO + currency links) for a master."""
    associations = (
        db.query(MasterCourseTaskAssociation)
        .filter(MasterCourseTaskAssociation.course_master_id == course_master_id)
        .order_by(MasterCourseTaskAssociation.position, MasterCourseTaskAssociation.id)
        .all()
    )
    return [_serialize_task_association(a) for a in associations]


def save_task_associations(
    db: Session,
    course_master_id: int,
    associations: list,
) -> list[dict]:
    """Replace all task associations for a course master with the given list.

    Each input has a ``task_master_id`` plus ``enabling_objective_ids`` and
    ``currency_master_ids``. Existing rows are deleted (cascading to their EO /
    currency links) and recreated in order. References are validated up-front.
    """
    from app.modules.course_info.models import MasterEnablingObjective

    get_or_raise_currencies_master(db, course_master_id)

    # The task must be one of this course's flight-package tasks.
    allowed_task_ids = {t["task_master_id"] for t in get_available_tasks(db, course_master_id)}
    eo_ids = {eid for a in associations for eid in a.enabling_objective_ids}
    currency_ids = {cid for a in associations for cid in a.currency_master_ids}

    seen_task_ids: set[int] = set()
    for a in associations:
        if a.task_master_id not in allowed_task_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Task {a.task_master_id} is not in this course's flight packages.",
            )
        # Each task may be associated only once.
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

    db.query(MasterCourseTaskAssociation).filter(
        MasterCourseTaskAssociation.course_master_id == course_master_id,
    ).delete(synchronize_session=False)
    db.flush()

    for pos, a in enumerate(associations):
        new_assoc = MasterCourseTaskAssociation(
            course_master_id=course_master_id,
            task_master_id=a.task_master_id,
            position=pos,
        )
        db.add(new_assoc)
        db.flush()
        # De-dupe ids while preserving order.
        for eid in dict.fromkeys(a.enabling_objective_ids):
            db.add(MasterCourseTaskAssociationEO(association_id=new_assoc.id, enabling_objective_id=eid))
        for cid in dict.fromkeys(a.currency_master_ids):
            db.add(MasterCourseTaskAssociationCurrency(association_id=new_assoc.id, currency_master_id=cid))

    db.commit()
    return get_task_associations(db, course_master_id)


def set_task_association_status(
    db: Session,
    master: CourseMaster,
    complete: bool,
    user_id: int,
) -> CourseMaster:
    """Toggle completion status for the Task Association sub-tab (0 or 100)."""
    if not complete and master.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    master.task_association_completion = 100 if complete else 0
    master.updated_by_id = user_id
    db.commit()
    db.refresh(master)
    return master


def get_or_raise_currencies_master(db: Session, course_master_id: int) -> CourseMaster:
    master = db.get(CourseMaster, course_master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Course master not found")
    return master


def get_certificate_by_master(db: Session, course_master_id: int) -> MasterCourseCertificate | None:
    """Get certificate record for a given course master."""
    return db.query(MasterCourseCertificate).filter(
        MasterCourseCertificate.course_master_id == course_master_id
    ).first()


def _get_material_dir() -> Path:
    """Get the MATERIAL_UPLOAD_DIR as a proper Path object."""
    val = settings.MATERIAL_UPLOAD_DIR
    return Path(val) if not isinstance(val, Path) else val


def upload_certificate(
    db: Session,
    course_master_id: int,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    user_id: int,
) -> dict:
    """Upload a certificate PDF directly to permanent storage.
    
    Returns {storage_key: str}.
    """
    _validate_pdf(file_bytes, content_type)

    get_or_raise_currencies_master(db, course_master_id)

    # Clean up any existing cert row
    db.query(MasterCourseCertificate).filter(
        MasterCourseCertificate.course_master_id == course_master_id,
    ).delete(synchronize_session=False)
    db.flush()

    # Permanent storage uses year/month structure
    now = datetime.now(timezone.utc)
    year_month = Path(str(now.year)) / f"{now.month:02d}"
    material_dir = _get_material_dir()
    dest_dir = material_dir / year_month
    dest_dir.mkdir(parents=True, exist_ok=True)

    ext = ".pdf"
    perm_file = dest_dir / f"{uuid.uuid4()}{ext}"
    perm_file.write_bytes(file_bytes)

    storage_key = str(perm_file.relative_to(material_dir)).replace("\\", "/")

    new_cert = MasterCourseCertificate(
        course_master_id=course_master_id,
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
    }


# ---------------------------------------------------------------------------
# Flight Pack Association (master)
# ---------------------------------------------------------------------------

def _serialize_fpa_association(assoc: MasterCourseFlightPackAssociation) -> dict:
    """Serialize an FPA association with its lesson links."""
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


def get_flight_pack_associations(db: Session, course_master_id: int) -> list[dict]:
    """Return all flight-pack-association records (with lesson links) for a master."""
    associations = (
        db.query(MasterCourseFlightPackAssociation)
        .filter(MasterCourseFlightPackAssociation.course_master_id == course_master_id)
        .order_by(MasterCourseFlightPackAssociation.position, MasterCourseFlightPackAssociation.id)
        .all()
    )
    return [_serialize_fpa_association(a) for a in associations]


def save_flight_pack_associations(
    db: Session,
    course_master_id: int,
    associations: list,
) -> list[dict]:
    """Replace all flight-pack associations for a course master.

    Each input has a ``package_id`` (must be from this course's flight packages)
    and a ``lesson_ids`` list (must exist in the master's Lesson Creation tab).
    Existing rows are deleted (cascading to lesson links) and recreated in order.
    """
    get_or_raise_currencies_master(db, course_master_id)

    # Get master's lesson creation for validation
    from app.modules.course_info.models import CourseInfoLessonCreationLesson
    lesson_ids_set: set[int] = set()
    for a in associations:
        lesson_ids_set.update(a.lesson_ids)

    if lesson_ids_set:
        found = {r.id for r in db.query(CourseInfoLessonCreationLesson.id).filter(CourseInfoLessonCreationLesson.id.in_(lesson_ids_set)).all()}
        missing = lesson_ids_set - found
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown lesson id(s): {sorted(missing)}")

    # The package must be one of this course's flight packages.
    allowed_package_ids = {
        p.id for p in db.query(MasterCourseFlightPackage.id)
        .filter(MasterCourseFlightPackage.course_master_id == course_master_id)
        .all()
    }

    seen_package_ids: set[int] = set()
    for a in associations:
        if a.package_id not in allowed_package_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Package {a.package_id} is not in this course's flight packages.",
            )
        # Each package may be associated only once.
        if a.package_id in seen_package_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Package {a.package_id} is already associated.",
            )
        seen_package_ids.add(a.package_id)

    # Delete all existing FPA rows (cascade deletes lesson links automatically)
    db.query(MasterCourseFlightPackAssociation).filter(
        MasterCourseFlightPackAssociation.course_master_id == course_master_id,
    ).delete(synchronize_session=False)
    db.flush()

    for pos, a in enumerate(associations):
        new_assoc = MasterCourseFlightPackAssociation(
            course_master_id=course_master_id,
            package_id=a.package_id,
            position=pos,
        )
        db.add(new_assoc)
        db.flush()
        # De-dupe lesson_ids while preserving order.
        for lid in dict.fromkeys(a.lesson_ids):
            db.add(MasterCourseFlightPackAssociationLesson(
                association_id=new_assoc.id,
                lesson_id=lid,
                position=pos,
            ))

    db.commit()
    return get_flight_pack_associations(db, course_master_id)


def get_available_packages(db: Session, course_master_id: int) -> list[dict]:
    """Flight packages available for FPA association — name only."""
    packages = (
        db.query(MasterCourseFlightPackage)
        .filter(MasterCourseFlightPackage.course_master_id == course_master_id)
        .order_by(MasterCourseFlightPackage.position, MasterCourseFlightPackage.id)
        .all()
    )
    return [dict(package_id=p.id, package_name=p.name) for p in packages]


def get_available_lessons(db: Session, course_master_id: int) -> list[dict]:
    """Lessons selectable for FPA association — from the master's Lesson Creation tab."""
    from app.modules.course_info.models import CourseInfoLessonCreation, CourseInfoLessonCreationLesson

    lesson_creation = (
        db.query(CourseInfoLessonCreation)
        .filter(CourseInfoLessonCreation.course_master_id == course_master_id)
        .first()
    )
    if not lesson_creation:
        return []

    lessons = (
        db.query(CourseInfoLessonCreationLesson)
        .filter(CourseInfoLessonCreationLesson.course_info_lesson_creation_id == lesson_creation.id)
        .order_by(CourseInfoLessonCreationLesson.order_index, CourseInfoLessonCreationLesson.id)
        .all()
    )
    return [
        dict(id=l.id, lesson_title=l.lesson_title if l.lesson_title else f"Lesson {l.order_index + 1}")
        for l in lessons
    ]


def set_flight_pack_association_status(
    db: Session,
    master: CourseMaster,
    complete: bool,
    user_id: int,
) -> CourseMaster:
    """Toggle completion status for the Flight Pack Association sub-tab (0 or 100)."""
    if not complete and master.status == "approved":
        raise HTTPException(
            status_code=409,
            detail="Course is approved; categories cannot be unmarked complete.",
        )
    master.flight_pack_association_completion = 100 if complete else 0
    master.updated_by_id = user_id
    db.commit()
    db.refresh(master)
    return master
