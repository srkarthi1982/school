"""Light Arabic text normalisation, applied symmetrically to chunk text (at
ingestion) and to the query (at search) before embedding.

Every substitution targets an Arabic-specific code point, so Latin/other-script
text passes through untouched — it is always safe to run. bge-m3 is already
multilingual and cross-lingual; normalisation just removes spelling/diacritic
variance that otherwise splits recall across near-identical Arabic forms.

Code points are written as explicit \\uXXXX escapes so the ranges are
unambiguous regardless of editor/font rendering.
"""
from __future__ import annotations

import re

# Harakat / tashkeel and other Arabic combining marks (diacritics, superscript
# alef, Quranic annotation signs, Arabic Extended-A marks). All ranges are
# ordered low→high so re.compile never raises.
_TASHKEEL = re.compile(
    "[ؐ-ًؚ-ٰٟۖ-ۜ۟-ۨ"
    "۪-ۭ࣓-ࣣ࣡-ࣿ]"
)
# Tatweel / kashida (letter-stretching character).
_TATWEEL = re.compile("ـ")

_REPLACEMENTS = {
    "آ": "ا",  # alef madda       → alef
    "أ": "ا",  # alef hamza above → alef
    "إ": "ا",  # alef hamza below → alef
    "ى": "ي",  # alef maqsura     → ya
    "ة": "ه",  # ta marbuta       → ha
    "ؤ": "و",  # waw with hamza   → waw
    "ئ": "ي",  # ya with hamza    → ya
}


def normalize_arabic(text: str) -> str:
    if not text:
        return text
    text = _TASHKEEL.sub("", text)
    text = _TATWEEL.sub("", text)
    for src, dst in _REPLACEMENTS.items():
        if src in text:
            text = text.replace(src, dst)
    return text


def normalize_for_embedding(text: str, enabled: bool = True) -> str:
    """Return the text to embed. No-op when disabled or empty."""
    if not enabled or not text:
        return text
    return normalize_arabic(text)
