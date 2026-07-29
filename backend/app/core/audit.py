import enum
from datetime import date, datetime, time, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session, attributes


def _serialize(val: Any) -> Any:
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, time):
        return val.isoformat()
    if isinstance(val, enum.Enum):
        return val.value
    if isinstance(val, UUID):
        return str(val)
    return val


def _obj_to_dict(obj) -> dict:
    """All column attribute values of obj as a JSON-serialisable dict.

    Columns listed in the model's ``__audit_exclude__`` frozenset are omitted.
    """
    exclude: frozenset = getattr(type(obj), "__audit_exclude__", frozenset())
    return {
        col.key: _serialize(getattr(obj, col.key))
        for col in inspect(type(obj)).mapper.column_attrs
        if col.key not in exclude
    }


def _dirty_diff(obj) -> tuple[dict, dict, list[str]]:
    """Return (before_data, after_data, changed_fields) for a dirty object."""
    exclude: frozenset = getattr(type(obj), "__audit_exclude__", frozenset())
    before: dict = {}
    after: dict = {}
    changed: list[str] = []

    for col in inspect(type(obj)).mapper.column_attrs:
        key = col.key
        if key in exclude:
            continue
        hist = attributes.get_history(obj, key)
        current = _serialize(getattr(obj, key))
        if hist.deleted:
            old = _serialize(hist.deleted[0])
            before[key] = old
            after[key] = current
            if old != current:
                changed.append(key)
        else:
            val = _serialize(hist.unchanged[0]) if hist.unchanged else current
            before[key] = val
            after[key] = current

    return before, after, changed


def register_audit_listener() -> None:
    """Register SQLAlchemy session event listeners for audit logging.

    Must be called once at application startup, after all models are imported.
    """
    from app.core.context import current_user_id_var
    from app.core.database import AuditedMixin

    @event.listens_for(Session, "before_flush")
    def _before_flush(session, flush_context, instances):
        from app.modules.audit.models import AuditLog

        # Prefer session.info: the ContextVar is only visible when it was set
        # in this task's context (async callers, schedulers); values set in
        # threadpool-run request dependencies land in session.info instead.
        user_id = session.info.get("current_user_id")
        if user_id is None:
            user_id = current_user_id_var.get()
        now = datetime.now(timezone.utc)

        # Set *_by_id fields before capturing diffs so they appear in after_data.
        for obj in list(session.new):
            if isinstance(obj, AuditedMixin) and not isinstance(obj, AuditLog):
                obj.created_by_id = user_id
                obj.updated_by_id = user_id

        for obj in list(session.dirty):
            if isinstance(obj, AuditedMixin) and not isinstance(obj, AuditLog):
                obj.updated_by_id = user_id

        # Capture UPDATE entries.
        for obj in list(session.dirty):
            if isinstance(obj, AuditLog) or not hasattr(obj, "__tablename__"):
                continue
            before, after, changed = _dirty_diff(obj)
            if changed:
                session.add(AuditLog(
                    table_name=obj.__tablename__,
                    row_id=str(getattr(obj, "id", "?")),
                    operation="UPDATE",
                    user_id=user_id,
                    timestamp=now,
                    before_data=before,
                    after_data=after,
                    changed_fields=changed,
                ))

        # Capture DELETE entries.
        for obj in list(session.deleted):
            if isinstance(obj, AuditLog) or not hasattr(obj, "__tablename__"):
                continue
            session.add(AuditLog(
                table_name=obj.__tablename__,
                row_id=str(getattr(obj, "id", "?")),
                operation="DELETE",
                user_id=user_id,
                timestamp=now,
                before_data=_obj_to_dict(obj),
                after_data=None,
                changed_fields=None,
            ))

        # Stash INSERT objects for after_flush where their IDs are available.
        session._audit_pending_inserts = [  # type: ignore[attr-defined]
            (obj, user_id, now)
            for obj in list(session.new)
            if not isinstance(obj, AuditLog) and hasattr(obj, "__tablename__")
        ]

    @event.listens_for(Session, "after_flush")
    def _after_flush(session, flush_context):
        from app.modules.audit.models import AuditLog

        pending = getattr(session, "_audit_pending_inserts", None)
        if not pending:
            return
        # Clear before adding new entries to prevent re-processing on the
        # next flush cycle triggered by the AuditLog inserts themselves.
        session._audit_pending_inserts = []

        for obj, user_id, now in pending:
            session.add(AuditLog(
                table_name=obj.__tablename__,
                row_id=str(getattr(obj, "id", "?")),
                operation="INSERT",
                user_id=user_id,
                timestamp=now,
                before_data=None,
                after_data=_obj_to_dict(obj),
                changed_fields=None,
            ))
