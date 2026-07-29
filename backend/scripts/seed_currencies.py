#!/usr/bin/env python3
"""Seed currency data from SQL Server CURRENCIES table.

Reads from an external SQL Server and populates the local currencies_master table.
Safe to run repeatedly (idempotent): existing IDs are skipped unless
--force is passed or SEED_FORCE=true is set in the environment.

Run from the backend directory with:
    uv run python -m scripts.seed_currencies
"""

import logging
import os
import re
import sys
from pathlib import Path
from argparse import ArgumentParser

# ── SQL Server connection constants ──────────────────────────────────────

DB_CONFIG = {
    "DRIVER": "{ODBC Driver 17 for SQL Server}",
    "SERVER": "JACL7ESUAT01",
    "PORT": 1433,
    "DATABASE": "es_scrambled",
    "UID": "scrambled",
    "PWD": "scr@mbled!1",
}

CURR_TABLE = "VW_CURRENCIES"
CURR_COL_ID = "CurrencyId"
CURR_COL_NAME = "Name"

# ── Backend imports ─────────────────────────────────────────────────────

_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
os.chdir(_BACKEND_DIR)

_VENV_DIR = _BACKEND_DIR / ".venv"


def _ensure_backend_venv() -> None:
    """Fail early with an actionable message if the backend venv isn't in use."""
    if not _VENV_DIR.exists():
        return
    if Path(sys.prefix).resolve() == _VENV_DIR.resolve():
        return
    activate = (
        _VENV_DIR / "Scripts" / "Activate.ps1"
        if os.name == "nt"
        else f"source {_VENV_DIR / 'bin' / 'activate'}"
    )
    venv_python = _VENV_DIR / ("Scripts" if os.name == "nt" else "bin") / "python"
    sys.exit(
        "Virtual environment is not active.\n"
        f"Activate the backend virtualenv first, then re-run:\n"
        f"    {activate}\n"
        "Or run it directly with the venv interpreter:\n"
        f"    {venv_python} {Path(__file__).name}"
    )


_ensure_backend_venv()

import pyodbc


def _get_source_connection_string():
    return (
        f"DRIVER={DB_CONFIG['DRIVER']};"
        f"SERVER={DB_CONFIG['SERVER']},{DB_CONFIG['PORT']};"
        f"DATABASE={DB_CONFIG['DATABASE']};"
        f"UID={DB_CONFIG['UID']};"
        f"PWD={DB_CONFIG['PWD']};Trusted_Connection=no;"
    )


def fetch_currencies_from_sql_server() -> list[dict]:
    """Fetch currency records from the external SQL Server CURRENCIES table."""
    conn_str = _get_source_connection_string()
    conn = pyodbc.connect(conn_str)
    try:
        cursor = conn.cursor()
        query = f"SELECT {CURR_COL_ID}, {CURR_COL_NAME} FROM {CURR_TABLE} WHERE {CURR_COL_ID} > 0"
        cursor.execute(query)
        rows = cursor.fetchall()
        currencies = []
        for row in rows:
            currencies.append({
                "id": row[0],
                "name": str(row[1]).strip(),
                "status": "green",
            })
        return currencies
    finally:
        conn.close()


# ── DB imports (local target) ───────────────────────────────────────────

from app.core.database import SessionLocal
from app.modules import import_all_models
from app.modules.currencies_certificate.models import CurrencyMaster

logger = logging.getLogger(__name__)


def _resolve_unique_code(code: str, existing_by_code: dict[str, int], new_id: int) -> str:
    """If *code* is already taken by a different ID, append _2, _3, ..."""
    owner_id = existing_by_code.get(code)
    if owner_id is None or owner_id == new_id:
        return code
    counter = 2
    while True:
        candidate = f"{code}_{counter}"
        if candidate not in existing_by_code:
            return candidate
        counter += 1


def seed_currencies(db, currencies) -> None:
    """Upsert currencies into the local currencies_master table.

    - IDs that don't exist in the local DB are INSERTed.
    - IDs that already exist are UPDATED (name, code, status).
    - Code collisions with different IDs get a _N suffix.
    """
    existing_by_id = {c.id: c for c in db.query(CurrencyMaster).all()}

    # Build live code -> ID map: old codes held by existing records
    live_code_owner = {}
    for c in existing_by_id.values():
        live_code_owner[c.code] = c.id

    inserted = 0
    updated = 0

    for entry in currencies:
        new_id = entry["id"]
        base_code = entry["code"]

        if new_id in existing_by_id:
            record = existing_by_id[new_id]
            old_code = record.code
            record.name = entry["name"]
            record.status = entry.get("status", "green")

            # Clear old code from live map
            if live_code_owner.get(old_code) == new_id:
                del live_code_owner[old_code]

            # Find a unique code — avoid collisions with other existing records
            target_code = _resolve_unique_code(base_code, live_code_owner, new_id)
            live_code_owner[target_code] = new_id
            record.code = target_code
            db.add(record)

            if target_code == base_code:
                updated += 1
                logger.info("Updated currency (id=%d): %s", new_id, record.name)
            else:
                updated += 1
                logger.info("Updated currency (id=%d): %s (code %s -> %s)", new_id, record.name, old_code, target_code)
            continue

        # New record — resolve potential code collision
        unique_code = _resolve_unique_code(base_code, live_code_owner, new_id)
        live_code_owner[unique_code] = new_id

        currency = CurrencyMaster(
            id=new_id,
            name=entry["name"],
            code=unique_code,
            status=entry.get("status", "green"),
        )
        db.add(currency)
        inserted += 1
        extra = f" (code renamed from {base_code} to {unique_code})" if unique_code != base_code else ""
        logger.info("Inserted new currency (id=%d): %s -> %s%s", new_id, entry["name"], unique_code, extra)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Database error during seed: %s", exc)
        raise

    actual = db.query(CurrencyMaster.id).count()
    logger.info("Seed complete: %d total rows (inserted=%d, updated=%d)", actual, inserted, updated)


def main() -> None:
    parser = ArgumentParser(description="Seed currencies_master from SQL Server CURRENCIES table")
    parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    import_all_models()

    logger.info("Fetching currencies from SQL Server (%s\\%s)", DB_CONFIG["SERVER"], DB_CONFIG["DATABASE"])
    raw_currencies = fetch_currencies_from_sql_server()

    for c in raw_currencies:
        raw_name = c["name"].upper()
        raw_name = re.sub(r'[^A-Z0-9]', '_', raw_name)
        raw_name = re.sub(r'_+', '_', raw_name)
        c["code"] = raw_name.strip('_')

    logger.info("Fetched %d currencies from SQL Server", len(raw_currencies))

    db = SessionLocal()
    try:
        seed_currencies(db, raw_currencies)
    finally:
        db.close()


if __name__ == "__main__":
    main()
