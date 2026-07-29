from importlib import import_module

from fastapi import APIRouter

# Ordered list of domain modules. Order matters: models are imported in this
# order, so modules that define foreign-key targets must appear before modules
# that reference them.
MODULE_NAMES = [
    "users",         # User, Role, AuthProvider â€” no FKs
    "auth",          # endpoints only; imports user.models
    "access",        # endpoints only; imports user.models
    "shared",        # Country â€” standalone reference data (used by profile)
    "term",          # AcademicYear, Semester
    "catalog",       # Department, Program, Course
    "profile",       # Student â†’ User+Program, Teacher â†’ User+Department
    "section",       # Section â†’ Course+Semester+Teacher, Schedule â†’ Section
    "enrollment",    # Enrollment â†’ Student+Section
    "attendance",         # Attendance â†’ Student+Section
    "attendance_status",  # AttendanceStatus â†’ code/name lookup
    "pat",           # Personal access tokens (MCP clients) â†’ User
    "agent",         # AI agents (AskMAI) â€” before chat: chat messages FK agents
    "chat",          # Chat conversations and messages
    "file_sharing",  # SharedFolder, SharedFile
    "quiz_bank",     # Quiz, QuizQuestion â€” standalone
    "progress_tracker",  # Progress Tracker â€” standalone
    "schedule_entry",# Personal calendar entries â†’ User
    "forms",         # DynamicForm â€” standalone
    "request",       # Request, RequestStatusHistory â€” depends on User,
    "faq",           # Faq â€” depends on User
    "it_support",    # Ticket, TicketHistory â€” depend on User
    "notification",  # Notificattion,
    "class_session", # Virtual classroom (LiveKit) â†’ User
    "course_master", # Course Builder master records
    "course_info",   # Course Builder Course Information
    "currencies_certificate", # Currencies & Certificate â†’ course_master
    "material",      # Course Builder Material
    "evaluation",    # Course Builder Evaluation (lessonâ†”quiz) â†’ course_info + quiz_bank
    "schedule",      # Course Builder Schedule â†’ course_master + course_info lessons
    "course",        # Course Builder instances (CourseInstance)
    "course_selection_material",    # Course Selection Material â†’ course_instances + lessons
    "course_selection_form",        # Course Selection Form â†’ course_instances + lessons
    "course_selection_evaluation",  # Course Selection Evaluation â†’ course_instances + lessons
    "course_selection_info",        # Course Selection Course Information â†’ course_instances + course_info
    "course_selection_schedule",    # Course Selection Schedule â†’ course_instances + course_selection_info lessons
    "course_session_schedule",      # Operational fork of the selection schedule (copied on approve)
    "course_selection_currencies_certificate",  # Course Selection Currencies & Certificate â†’ course_instances
    "audit",         # AuditLog â†’ User â€” must be last
    "library",       # Library â†’ Manage library
    "survey",        # Survey , survey questions"form",          # Form (dynamic form builder, mirrors survey) â†’ courses
	"form",          # Form (dynamic form builder, mirrors survey) â†’ courses
    "form_builder",  # Course Builder Form Builder (lesson/course↔survey/form) → course_info + survey + form
    "grading",       # Grading: quiz/survey/form grades + progress
    "analytics",     # Usage analytics: events, snapshots, rollups → User
    "rag",           # RAG: document_chunks (pgvector) → course_selection_material + library
    "dashboard",     # Dashboard module (summary endpoints)
]

# Modules that expose SQLAlchemy models via a `models` submodule. The auth
# module has no DB models of its own, so it's omitted from metadata import.
_MODEL_MODULES = [name for name in MODULE_NAMES if name not in ("auth", "access")]


def create_api_router() -> APIRouter:
    """Import all modules and aggregate their routers."""
    api_router = APIRouter()
    for name in MODULE_NAMES:
        mod = import_module(f"app.modules.{name}")
        api_router.include_router(mod.router)
    return api_router


def import_all_models():
    """Ensure every module's models are registered with Base.metadata.

    Called by Alembic env.py and at app startup so that SQLAlchemy can
    resolve all string-based relationship references.
    """
    for name in _MODEL_MODULES:
        if name == "chat":
            continue
        import_module(f"app.modules.{name}.models")
        from app.modules.chat import import_chat_models
    import_chat_models()
