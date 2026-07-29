#!/usr/bin/env python3
"""
string_replace.py

Traverse ./src, find occurrences of String(t('...')) and replace them.
Handles files with unknown / non‑utf‑8 encodings gracefully.
"""

import argparse
import pathlib
import re
import sys
from typing import Iterable, Tuple

# ----------------------------------------------------------------------
# Optional: try to import a smart charset detector.
# ----------------------------------------------------------------------
try:
    # charset‑normalizer is the default library used by requests & fastapi
    from charset_normalizer import from_path  # type: ignore
except Exception:  # pragma: no cover
    try:
        from chardet import detect  # type: ignore
    except Exception:
        from_path = None
        detect = None

# ----------------------------------------------------------------------
# Regex yang dicari
# ----------------------------------------------------------------------
PATTERN = re.compile(
    r"""String\(\s*t\(\s*(['"])(.*?)\1\s*\)\s*\)""",
    re.DOTALL,
)

# ----------------------------------------------------------------------
# Helper utilities
# ----------------------------------------------------------------------
def iter_source_files(root: pathlib.Path, extensions: Iterable[str]) -> Iterable[pathlib.Path]:
    """Yield all files under *root* whose suffix is in *extensions*."""
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in extensions:
            yield p


def detect_encoding(file_path: pathlib.Path) -> Tuple[str, bool]:
    """
    Detect the most probable text encoding of *file_path*.

    Returns a tuple ``(encoding, reliable)`` where *reliable* is ``True``
    if the detector is confident about its guess.
    """
    # 1️⃣ Try charset‑normalizer (fast, pure‑python)
    if from_path is not None:
        result = from_path(file_path).best()
        if result is not None:
            return result.encoding or "utf-8", result.chaos < 0.2  # chaos < 0.2 ≈ reliable

    # 2️⃣ Fallback to chardet (if installed)
    if detect is not None:
        raw = file_path.read_bytes()
        info = detect(raw)
        encoding = info.get("encoding")
        confidence = info.get("confidence", 0)
        if encoding and confidence > 0.6:
            return encoding, True

    # 3️⃣ Ultimate fallback → assume utf‑8 (may raise later)
    return "utf-8", False


def read_text_safely(file_path: pathlib.Path) -> Tuple[str, str]:
    """
    Read *file_path* using its detected encoding.
    Returns ``(text, encoding_used)``.
    If detection fails, we fall back to ``utf‑8`` with ``errors='replace'``.
    """
    enc, reliable = detect_encoding(file_path)

    try:
        text = file_path.read_text(encoding=enc)
        return text, enc
    except (UnicodeDecodeError, LookupError):
        # LookupError = unknown encoding name (very rare)
        # If the detected encoding still fails, read as binary and decode with fallback.
        raw = file_path.read_bytes()
        # errors='replace' inserts � for undecodable bytes – safe for further regex work.
        text = raw.decode("utf-8", errors="replace")
        return text, "utf-8 (fallback)"


def replace_in_text(text: str, mode: str) -> str:
    """
    Replace all matches of PATTERN in *text* according to *mode*.

    mode:
        - "keep_inner" → String(t('foo'))   =>   t('foo')
        - "common_id"  → String(t('foo'))   =>   t('common.id')
    """
    if mode == "keep_inner":
        repl = r"t(\1\2\1)"
    elif mode == "common_id":
        repl = "t('common.id')"
    else:
        raise ValueError(f"Unsupported mode: {mode}")

    return PATTERN.sub(repl, text)


def write_back(file_path: pathlib.Path, new_text: str, original_encoding: str) -> None:
    """
    Write *new_text* to *file_path* using *original_encoding* if possible.
    If the original encoding is not a text codec (e.g. binary), we fall back to UTF‑8.
    """
    try:
        file_path.write_text(new_text, encoding=original_encoding)
    except (LookupError, UnicodeEncodeError):
        # Fallback – most source files are ASCII‑compatible, so UTF‑8 works.
        file_path.write_text(new_text, encoding="utf-8")


def process_file(path: pathlib.Path, mode: str, dry_run: bool = False) -> bool:
    """
    Read *path*, replace patterns, write back (or just report if dry‑run).

    Returns ``True`` if the file was changed.
    """
    original_text, used_enc = read_text_safely(path)
    new_text = replace_in_text(original_text, mode)

    if original_text == new_text:
        return False  # tidak ada perubahan

    if dry_run:
        print(f"[DRY‑RUN] Would modify: {path} (detected encoding: {used_enc})")
        return True

    # backup
    backup_path = path.with_suffix(path.suffix + ".bak")
    backup_path.write_bytes(path.read_bytes())  # raw copy, keep original bytes intact
    write_back(path, new_text, used_enc)
    print(f"✅ Modified: {path} (backup → {backup_path.name}, encoding: {used_enc})")
    return True


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Traverse ./src and replace String(t('...')) patterns, handling unknown encodings."
    )
    parser.add_argument(
        "-d",
        "--directory",
        default="./src",
        help="Root directory to scan (default: ./src)",
    )
    parser.add_argument(
        "-e",
        "--extensions",
        default=".js,.jsx,.ts,.tsx,.vue,.html",
        help="Comma‑separated list of file extensions to process.",
    )
    parser.add_argument(
        "-m",
        "--mode",
        choices=["keep_inner", "common_id"],
        default="keep_inner",
        help="Replacement mode (default: keep_inner).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only show what would be changed, without writing any file.",
    )
    args = parser.parse_args()

    root = pathlib.Path(args.directory).resolve()
    if not root.is_dir():
        sys.exit(f"❌ Error: Directory not found → {root}")

    extensions = {e if e.startswith(".") else f".{e}" for e in args.extensions.split(",")}

    total = changed = 0
    for file_path in iter_source_files(root, extensions):
        total += 1
        if process_file(file_path, mode=args.mode, dry_run=args.dry_run):
            changed += 1

    print("\n=== Summary ===")
    print(f"Scanned files   : {total}")
    print(f"Files modified  : {changed}")
    if args.dry_run:
        print("NOTE: Dry‑run – no files were actually written.")
    else:
        print("Backup files (*.bak) were created alongside each modified file.")


if __name__ == "__main__":
    main()