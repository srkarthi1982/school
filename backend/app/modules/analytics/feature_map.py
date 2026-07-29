"""Curated mapping from request path to a human 'feature' label.

Resolved at query/rollup time (not stored on the event) so groupings can be
changed retroactively. The first path segment after ``/api/v1/`` identifies the
router; several routers collapse into one user-facing feature (e.g. all the
``course-selection-*`` routers → "Course Selection").
"""

from __future__ import annotations

API_PREFIX = "/api/v1"
OTHER = "Other"

# Exact first-segment → feature label.
_SEGMENT_MAP: dict[str, str] = {
    "users": "User Management",
    "access": "Access Control",
    "auth": "Authentication",
    "shared": "Reference Data",
    "catalog": "Academic Catalog",
    "departments": "Academic Catalog",
    "programs": "Academic Catalog",
    "profile-info": "Profiles",
    "students": "Profiles",
    "teachers": "Profiles",
    "terms": "Academic Calendar",
    "sections": "Sections",
    "schedule-entries": "Personal Schedule",
    "enrollments": "Enrollments",
    "attendance": "Attendance",
    "attendance_status": "Attendance",
    "grading": "Grading",
    "pats": "API Tokens",
    "agents": "AI Agent",
    "file-sharing": "File Sharing",
    "quiz-bank": "Quiz Bank",
    "progress-tracker": "Progress Tracker",
    "forms": "Forms",
    "form": "Forms",
    "form-builders": "Forms",
    "survey": "Survey",
    "requests": "Requests",
    "faq": "FAQ",
    "it-support": "IT Support",
    "notification": "Notifications",
    "class-sessions": "Virtual Classroom",
    "library": "Library",
    "audit-logs": "Audit Logs",
    "analytics": "Usage Analytics",
}

# First segments that belong to the Course Builder feature.
_COURSE_BUILDER_SEGMENTS = frozenset({
    "course-masters",
    "course-infos",
    "courses",
    "materials",
    "evaluations",
    "schedules",
})

# The full set of feature labels, so reports can surface never-used features.
FEATURE_CATALOG: list[str] = sorted(
    set(_SEGMENT_MAP.values()) | {"Course Builder", "Course Selection", "Chat"}
)


def resolve_feature(path: str) -> str:
    """Return the feature label for a request path (never raises)."""
    p = path
    if p.startswith(API_PREFIX):
        p = p[len(API_PREFIX):]
    p = p.strip("/")
    if not p:
        return OTHER

    # Chat lives under a few role-scoped prefixes: /chat, /student/chat, ...
    if "/chat" in "/" + p or p.startswith("chat"):
        return "Chat"

    seg = p.split("/", 1)[0].lower()

    if seg.startswith("course-selection") or seg == "course-session-schedules":
        return "Course Selection"
    if seg in _COURSE_BUILDER_SEGMENTS:
        return "Course Builder"

    return _SEGMENT_MAP.get(seg, OTHER)
