import enum
from typing import cast


class PermissionCode(str, enum.Enum):
    """Granular permission codes used across the application."""

    # Users
    USER_READ = "user:read"
    USER_WRITE = "user:write"

    # Students / Teachers (profiles)
    STUDENT_READ = "student:read"
    STUDENT_WRITE = "student:write"
    TEACHER_READ = "teacher:read"
    TEACHER_WRITE = "teacher:write"

    # Academic calendar
    TERM_READ = "term:read"
    TERM_WRITE = "term:write"

    # Academic catalog (Departments / Programs / academic Courses)
    CATALOG_READ = "catalog:read"
    CATALOG_WRITE = "catalog:write"

    # Course Management ? Course Builder (master/template records)
    COURSE_MASTER_READ = "course_master:read"
    COURSE_MASTER_WRITE = "course_master:write"

    # Course Management ? Courses (instances spawned from a master)
    COURSE_READ = "course:read"
    COURSE_WRITE = "course:write"
    COURSE_APPROVE = "course:approve"

    # Sections / Schedules
    SECTION_READ = "section:read"
    SECTION_WRITE = "section:write"

    # Enrollments / Grades
    ENROLLMENT_READ = "enrollment:read"
    ENROLLMENT_WRITE = "enrollment:write"
    GRADE_WRITE = "grade:write"

    # Attendance
    ATTENDANCE_READ = "attendance:read"
    ATTENDANCE_WRITE = "attendance:write"

    # Forms
    FORM_READ = "form:read"
    FORM_WRITE = "form:write"
    FORM_DELETE = "form:delete"

    # Schedule entries (personal calendar)
    SCHEDULE_ENTRY_READ = "schedule_entry:read"
    SCHEDULE_ENTRY_WRITE = "schedule_entry:write"

    # Audit logs
    AUDIT_READ = "audit:read"

    # Usage analytics
    ANALYTICS_READ = "analytics:read"

    # RBAC management
    ROLE_MANAGE = "role:manage"

    # Admin blanket
    ADMIN_FULL = "admin:full"

    # Quiz Bank
    QUIZ_VIEW = "quiz:view"
    QUIZ_MANAGE = "quiz:manage"
    QUIZ_APPROVE = "quiz:approve"
    QUIZ_REJECT = "quiz:reject"
    QUIZ_TAKE = "quiz:take"
    QUESTION_VIEW = "question:view"
    QUESTION_MANAGE = "question:manage"

    # File Sharing
    FILE_READ = "file:read"
    FILE_WRITE = "file:write"
    FILE_DELETE = "file:delete"

    # Library (material library — independent of Course Builder "material")
    LIBRARY_READ = "library:read"
    LIBRARY_WRITE = "library:write"
    LIBRARY_MANAGE = "library:manage"

    # Course Builder ? Material
    MATERIAL_READ = "material:read"
    MATERIAL_WRITE = "material:write"
    MATERIAL_DELETE = "material:delete"

    # Course Builder ? Course Information
    COURSE_INFO_READ = "course_info:read"
    COURSE_INFO_WRITE = "course_info:write"

    # Course Builder - Evaluation (lesson to quiz associations)
    EVALUATION_READ = "evaluation:read"
    EVALUATION_WRITE = "evaluation:write"
    EVALUATION_DELETE = "evaluation:delete"

    # Course Builder - Form Builder (lesson/course to survey & form associations)
    FORM_BUILDER_READ = "form_builder:read"
    FORM_BUILDER_WRITE = "form_builder:write"
    FORM_BUILDER_DELETE = "form_builder:delete"

    # Requests (Communication & Reporting)
    REQUEST_CREATE = "request:create"
    REQUEST_READ_OWN = "request:read_own"
    REQUEST_RESPOND = "request:respond"
    REQUEST_FORWARD = "request:forward"
    REQUEST_CONFIG = "request:config"

    # Virtual classroom (LiveKit-backed)
    CLASS_SESSION_READ = "class_session:read"
    CLASS_SESSION_WRITE = "class_session:write"
    CLASS_SESSION_HOST = "class_session:host"
    CLASS_SESSION_JOIN = "class_session:join"

    TICKET_CREATE = "ticket:create"
    TICKET_APPROVE = "ticket:approve"
    TICKET_RESPOND = "ticket:respond"
    TICKET_VIEW_ALL = "ticket:view_all"
    # Progress Tracker
    PROGRESS_TRACKER_STUDENT    = "progress_tracker:student"
    PROGRESS_TRACKER_TEACHER    = "progress_tracker:teacher"
    PROGRESS_TRACKER_ADMIN      = "progress_tracker:admin"

    # Currencies and Certificate
    CURCY_CERT_READ = "currencies_certificate:read"
    CURCY_CERT_WRITE = "currencies_certificate:write"

    # FAQ
    FAQ_READ = "faq:read"
    FAQ_WRITE = "faq:write"



    # Survey
    SURVEY_TAKE="survey:take"
    SURVEY_CREATOR = "survey:creator"
    SURVEY_VIEW="survey:view"

    # Form (dynamic form builder â€” mirrors Survey)
    FORM_TAKE = "form:take"
    FORM_CREATOR = "form:creator"
    FORM_VIEW = "form:view"

    # Dashboard
    DASHBOARD_LEADERSHIP = "dashboard:leadership"
    DASHBOARD_SAT = "dashboard:sat"
    DASHBOARD_INSTRUCTOR = "dashboard:instructor"
    DASHBOARD_STUDENT = "dashboard:student"

class _PermissionMeta:
    __slots__ = ("code", "name", "description", "module")

    def __init__(self, code: PermissionCode, name: str, description: str, module: str):
        self.code = code
        self.name = name
        self.description = description
        self.module = module


PERMISSION_REGISTRY: list[_PermissionMeta] = [
    _PermissionMeta(PermissionCode.USER_READ, "Read Users", "View user accounts", "users"),
    _PermissionMeta(PermissionCode.USER_WRITE, "Write Users", "Create, update, deactivate user accounts", "users"),
    _PermissionMeta(PermissionCode.STUDENT_READ, "Read Students", "View student profiles", "profiles"),
    _PermissionMeta(PermissionCode.STUDENT_WRITE, "Write Students", "Create and update student profiles", "profiles"),
    _PermissionMeta(PermissionCode.TEACHER_READ, "Read Teachers", "View teacher profiles", "profiles"),
    _PermissionMeta(PermissionCode.TEACHER_WRITE, "Write Teachers", "Create and update teacher profiles", "profiles"),
    _PermissionMeta(PermissionCode.TERM_READ, "Read Terms", "View academic years and semesters", "terms"),
    _PermissionMeta(PermissionCode.TERM_WRITE, "Write Terms", "Create and update academic calendar", "terms"),
    _PermissionMeta(PermissionCode.CATALOG_READ, "Read Catalog", "View departments, programs, and the academic course catalog", "catalog"),
    _PermissionMeta(PermissionCode.CATALOG_WRITE, "Write Catalog", "Create and update departments, programs, and the academic course catalog", "catalog"),
    _PermissionMeta(PermissionCode.COURSE_MASTER_READ, "Read Course Masters", "View Course Builder master records", "course_master"),
    _PermissionMeta(PermissionCode.COURSE_MASTER_WRITE, "Write Course Masters", "Create and update Course Builder master records", "course_master"),
    _PermissionMeta(PermissionCode.COURSE_READ, "Read Courses", "View Course Management course instances", "course"),
    _PermissionMeta(PermissionCode.COURSE_WRITE, "Write Courses", "Create and update Course Management course instances", "course"),
    _PermissionMeta(PermissionCode.COURSE_APPROVE, "Approve Course Edits", "Approve or reject pending Course modification requests", "course"),
    _PermissionMeta(PermissionCode.SECTION_READ, "Read Sections", "View sections and schedules", "sections"),
    _PermissionMeta(PermissionCode.SECTION_WRITE, "Write Sections", "Create and update sections and schedules", "sections"),
    _PermissionMeta(PermissionCode.ENROLLMENT_READ, "Read Enrollments", "View enrollment records", "enrollments"),
    _PermissionMeta(PermissionCode.ENROLLMENT_WRITE, "Write Enrollments", "Create and delete enrollments", "enrollments"),
    _PermissionMeta(PermissionCode.GRADE_WRITE, "Write Grades", "Update enrollment grades", "enrollments"),
    _PermissionMeta(PermissionCode.ATTENDANCE_READ, "Read Attendance", "View attendance records", "attendance"),
    _PermissionMeta(PermissionCode.ATTENDANCE_WRITE, "Write Attendance", "Create and update attendance records", "attendance"),
    _PermissionMeta(PermissionCode.FORM_READ, "Read Forms", "View dynamic forms", "forms"),
    _PermissionMeta(PermissionCode.FORM_WRITE, "Write Forms", "Create and update dynamic forms", "forms"),
    _PermissionMeta(PermissionCode.FORM_DELETE, "Delete Forms", "Delete dynamic forms", "forms"),
    _PermissionMeta(PermissionCode.SCHEDULE_ENTRY_READ, "Read Schedule Entries", "View own personal schedule entries", "schedule_entry"),
    _PermissionMeta(PermissionCode.SCHEDULE_ENTRY_WRITE, "Write Schedule Entries", "Create, update, and delete own schedule entries", "schedule_entry"),
    _PermissionMeta(PermissionCode.AUDIT_READ, "Read Audit Logs", "View system audit logs", "audit"),
    _PermissionMeta(PermissionCode.ANALYTICS_READ, "Read Usage Analytics", "View system usage analytics and statistics", "analytics"),
    _PermissionMeta(PermissionCode.ROLE_MANAGE, "Manage Roles", "Create and assign roles and permissions", "rbac"),
    _PermissionMeta(PermissionCode.ADMIN_FULL, "Full Admin", "Unrestricted system access", "admin"),
    _PermissionMeta(PermissionCode.FILE_READ, "Read Files", "View and download shared files", "file_sharing"),
    _PermissionMeta(PermissionCode.FILE_WRITE, "Write Files", "Upload files and create folders", "file_sharing"),
    _PermissionMeta(PermissionCode.FILE_DELETE, "Delete Files", "Delete own files and folders", "file_sharing"),
    _PermissionMeta(PermissionCode.MATERIAL_READ, "Read Course Materials", "View Course Builder material files and folders", "material"),
    _PermissionMeta(PermissionCode.MATERIAL_WRITE, "Write Course Materials", "Upload material files and create folders in Course Builder", "material"),
    _PermissionMeta(PermissionCode.MATERIAL_DELETE, "Delete Course Materials", "Delete Course Builder material files and folders", "material"),
    _PermissionMeta(PermissionCode.LIBRARY_READ, "Read Library", "Open the material library and view approved materials", "library"),
    _PermissionMeta(PermissionCode.LIBRARY_WRITE, "Write Library", "Upload Course materials to the library", "library"),
    _PermissionMeta(PermissionCode.LIBRARY_MANAGE, "Manage Library", "Upload General materials, approve/reject pending uploads, and delete others' files", "library"),
    _PermissionMeta(PermissionCode.COURSE_INFO_READ, "Read Course Information", "View Course Builder Course Information data", "course_info"),
    _PermissionMeta(PermissionCode.COURSE_INFO_WRITE, "Write Course Information", "Create and update Course Builder Course Information data", "course_info"),
    _PermissionMeta(PermissionCode.EVALUATION_READ, "Read Course Evaluation", "View Course Builder evaluation lesson-quiz associations", "evaluation"),
    _PermissionMeta(PermissionCode.EVALUATION_WRITE, "Write Course Evaluation", "Associate quizzes with lessons and manage evaluation completion in Course Builder", "evaluation"),
    _PermissionMeta(PermissionCode.EVALUATION_DELETE, "Delete Course Evaluation", "Remove quiz associations from Course Builder evaluation lessons", "evaluation"),
    _PermissionMeta(PermissionCode.FORM_BUILDER_READ, "Read Form Builder", "View Course Builder Form Builder survey/form associations", "form_builder"),
    _PermissionMeta(PermissionCode.FORM_BUILDER_WRITE, "Write Form Builder", "Associate surveys and forms with lessons or the course and manage Form Builder completion", "form_builder"),
    _PermissionMeta(PermissionCode.FORM_BUILDER_DELETE, "Delete Form Builder", "Remove survey/form associations from Course Builder Form Builder", "form_builder"),
    _PermissionMeta(PermissionCode.QUIZ_VIEW, "View Quiz", "View quiz", "quiz"),
    _PermissionMeta(PermissionCode.QUIZ_MANAGE, "Manage Quiz", "View, add, update, and delete quiz", "quiz"),
    _PermissionMeta(PermissionCode.QUIZ_APPROVE, "Approve Quiz", "Approve quiz", "quiz"),
    _PermissionMeta(PermissionCode.QUIZ_REJECT, "Reject Quiz", "Reject quiz", "quiz"),
    _PermissionMeta(PermissionCode.QUIZ_TAKE, "Take Quiz", "Take quiz", "quiz"),
    _PermissionMeta(PermissionCode.QUESTION_VIEW, "View Question", "View question", "quiz"),
    _PermissionMeta(PermissionCode.QUESTION_MANAGE, "Manage Question", "View, add, update, and delete question", "quiz"),
    _PermissionMeta(PermissionCode.REQUEST_CREATE, "Create Request", "Submit a new request", "request"),
    _PermissionMeta(PermissionCode.REQUEST_READ_OWN, "Read Own Requests", "View requests you sent or received", "request"),
    _PermissionMeta(PermissionCode.REQUEST_RESPOND, "Respond to Requests", "Claim, return, resolve, or approve requests", "request"),
    _PermissionMeta(PermissionCode.REQUEST_FORWARD, "Forward Requests", "Forward a request to another user", "request"),
    _PermissionMeta(PermissionCode.REQUEST_CONFIG, "Configure Requests", "Manage request overdue threshold and admin notifications", "request"),
    _PermissionMeta(PermissionCode.CLASS_SESSION_READ, "Read Class Sessions", "View virtual classroom sessions and recordings", "class_session"),
    _PermissionMeta(PermissionCode.CLASS_SESSION_WRITE, "Write Class Sessions", "Create, update, and delete own virtual classroom sessions", "class_session"),
    _PermissionMeta(PermissionCode.CLASS_SESSION_HOST, "Host Class Sessions", "Start, end, and moderate virtual classroom sessions", "class_session"),
    _PermissionMeta(PermissionCode.CLASS_SESSION_JOIN, "Join Class Sessions", "Mint a join token for a live virtual classroom", "class_session"),

    _PermissionMeta(PermissionCode.TICKET_CREATE, "Create Support Ticket", "Submit new IT Support ticket", "support"),
    _PermissionMeta(PermissionCode.TICKET_APPROVE, "Approve Support Ticket", "Approve or Decline a ticket", "support"),
    _PermissionMeta(PermissionCode.TICKET_RESPOND, "Respond to Support Tickets", "Claim, Resolve and Forward a ticket", "support"),
    _PermissionMeta(PermissionCode.TICKET_VIEW_ALL, "View All Tickets", "Allow user to view all tickets", "support"),
    _PermissionMeta(PermissionCode.FAQ_READ, "Read FAQ", "View FAQ entries", "faq"),
    _PermissionMeta(PermissionCode.FAQ_WRITE, "Write FAQ", "Create, update, and delete FAQ entries", "faq"),
    _PermissionMeta(PermissionCode.SURVEY_CREATOR, "Manage Survey", "View, add, update, and delete survey", "survey"),
    _PermissionMeta(PermissionCode.SURVEY_TAKE, "Take Survey", "Take survey", "survey"),
    _PermissionMeta(PermissionCode.SURVEY_VIEW, "View Survey", "Survey View", "survey"),
    _PermissionMeta(PermissionCode.FORM_CREATOR, "Manage Form", "View, add, update, and delete form", "form"),
    _PermissionMeta(PermissionCode.FORM_TAKE, "Take Form", "Take form", "form"),
    _PermissionMeta(PermissionCode.FORM_VIEW, "View Form", "Form View", "form"),
    _PermissionMeta(PermissionCode.PROGRESS_TRACKER_STUDENT, "Progress Tracker Student View", "Track progress as student", "progress_tracker"),
    _PermissionMeta(PermissionCode.PROGRESS_TRACKER_TEACHER, "Progress Tracker Teacher View", "Track progress as teacher", "progress_tracker"),
    _PermissionMeta(PermissionCode.PROGRESS_TRACKER_ADMIN, "Progress Tracker Admin View", "Track progress as admin", "progress_tracker"),

    _PermissionMeta(PermissionCode.CURCY_CERT_READ, "View Currencies and Certificate", "Currencies and Certificate View", "currencies_certificate"),
    _PermissionMeta(PermissionCode.CURCY_CERT_WRITE, "Manage Currencies & Certificate", "Select Currencies & Upload Certificate", "currencies_certificate"),

    _PermissionMeta(PermissionCode.DASHBOARD_LEADERSHIP, "Dashboard Leadership View", "Dashboard leadership view", "dashboard_leadership"),
    _PermissionMeta(PermissionCode.DASHBOARD_SAT, "Dashboard SAT View", "Dashboard SAT view", "dashboard_sat"),
    _PermissionMeta(PermissionCode.DASHBOARD_INSTRUCTOR, "Dashboard Instructor View", "Dashboard instructor view", "dashboard_instructor"),
    _PermissionMeta(PermissionCode.DASHBOARD_STUDENT, "Dashboard Student View", "Dashboard student view", "dashboard_student"),
]

DEFAULT_ROLE_PERMISSIONS: dict[str, list[PermissionCode]] = {
    "student": [
        PermissionCode.CATALOG_READ,
        PermissionCode.SECTION_READ,
        PermissionCode.TERM_READ,
        PermissionCode.STUDENT_READ,
        PermissionCode.TEACHER_READ,
        PermissionCode.ENROLLMENT_READ,
        PermissionCode.ATTENDANCE_READ,
        PermissionCode.FORM_READ,
        PermissionCode.SCHEDULE_ENTRY_READ,
        PermissionCode.SCHEDULE_ENTRY_WRITE,
        PermissionCode.FILE_READ,
        PermissionCode.FILE_WRITE,
        PermissionCode.REQUEST_CREATE,
        PermissionCode.REQUEST_READ_OWN,
        PermissionCode.CLASS_SESSION_READ,
        PermissionCode.CLASS_SESSION_JOIN,
        PermissionCode.TICKET_CREATE,
        PermissionCode.FAQ_READ,
        PermissionCode.MATERIAL_READ,
        PermissionCode.LIBRARY_READ,
        PermissionCode.COURSE_INFO_READ,
        PermissionCode.SURVEY_TAKE,
        PermissionCode.SURVEY_VIEW,
        PermissionCode.FORM_TAKE,
        PermissionCode.FORM_VIEW,
        PermissionCode.PROGRESS_TRACKER_STUDENT
    ],
    "teacher": [
        PermissionCode.CATALOG_READ,
        PermissionCode.COURSE_MASTER_READ,
        PermissionCode.COURSE_MASTER_WRITE,
        PermissionCode.COURSE_READ,
        PermissionCode.COURSE_WRITE,
        PermissionCode.SECTION_READ,
        PermissionCode.TERM_READ,
        PermissionCode.STUDENT_READ,
        PermissionCode.TEACHER_READ,
        PermissionCode.ENROLLMENT_READ,
        PermissionCode.GRADE_WRITE,
        PermissionCode.LIBRARY_READ,
        PermissionCode.LIBRARY_WRITE,
        PermissionCode.ATTENDANCE_READ,
        PermissionCode.ATTENDANCE_WRITE,
        PermissionCode.FORM_READ,
        PermissionCode.SCHEDULE_ENTRY_READ,
        PermissionCode.SCHEDULE_ENTRY_WRITE,
        PermissionCode.FILE_READ,
        PermissionCode.FILE_WRITE,
        PermissionCode.FILE_DELETE,
        PermissionCode.MATERIAL_READ,
        PermissionCode.MATERIAL_WRITE,
        PermissionCode.MATERIAL_DELETE,
        PermissionCode.COURSE_INFO_READ,
        PermissionCode.COURSE_INFO_WRITE,
        PermissionCode.EVALUATION_READ,
        PermissionCode.EVALUATION_WRITE,
        PermissionCode.EVALUATION_DELETE,
        PermissionCode.FORM_BUILDER_READ,
        PermissionCode.FORM_BUILDER_WRITE,
        PermissionCode.FORM_BUILDER_DELETE,
        PermissionCode.QUIZ_VIEW,
        PermissionCode.QUIZ_MANAGE,
        PermissionCode.REQUEST_CREATE,
        PermissionCode.REQUEST_READ_OWN,
        PermissionCode.REQUEST_RESPOND,
        PermissionCode.REQUEST_FORWARD,
        PermissionCode.CLASS_SESSION_READ,
        PermissionCode.CLASS_SESSION_WRITE,
        PermissionCode.CLASS_SESSION_HOST,
        PermissionCode.CLASS_SESSION_JOIN,
        PermissionCode.TICKET_CREATE,
        PermissionCode.FAQ_READ,
        PermissionCode.SURVEY_CREATOR,
        PermissionCode.SURVEY_VIEW,
        PermissionCode.FORM_CREATOR,
        PermissionCode.FORM_VIEW,
        PermissionCode.PROGRESS_TRACKER_TEACHER,
    ],
    "staff": [
        PermissionCode.USER_READ,
        PermissionCode.STUDENT_READ,
        PermissionCode.STUDENT_WRITE,
        PermissionCode.TEACHER_READ,
        PermissionCode.TEACHER_WRITE,
        PermissionCode.TERM_READ,
        PermissionCode.TERM_WRITE,
        PermissionCode.CATALOG_READ,
        PermissionCode.CATALOG_WRITE,
        PermissionCode.COURSE_MASTER_READ,
        PermissionCode.COURSE_MASTER_WRITE,
        PermissionCode.COURSE_READ,
        PermissionCode.COURSE_WRITE,
        PermissionCode.COURSE_APPROVE,
        PermissionCode.LIBRARY_READ,
        PermissionCode.LIBRARY_WRITE,
        PermissionCode.LIBRARY_MANAGE,
        PermissionCode.SECTION_READ,
        PermissionCode.SECTION_WRITE,
        PermissionCode.ENROLLMENT_READ,
        PermissionCode.ENROLLMENT_WRITE,
        PermissionCode.ATTENDANCE_READ,
        PermissionCode.ATTENDANCE_WRITE,
        PermissionCode.FORM_READ,
        PermissionCode.FORM_WRITE,
        PermissionCode.SCHEDULE_ENTRY_READ,
        PermissionCode.SCHEDULE_ENTRY_WRITE,
        PermissionCode.FILE_READ,
        PermissionCode.FILE_WRITE,
        PermissionCode.FILE_DELETE,
        PermissionCode.MATERIAL_READ,
        PermissionCode.MATERIAL_WRITE,
        PermissionCode.MATERIAL_DELETE,
        PermissionCode.COURSE_INFO_READ,
        PermissionCode.COURSE_INFO_WRITE,
        PermissionCode.EVALUATION_READ,
        PermissionCode.EVALUATION_WRITE,
        PermissionCode.EVALUATION_DELETE,
        PermissionCode.FORM_BUILDER_READ,
        PermissionCode.FORM_BUILDER_WRITE,
        PermissionCode.FORM_BUILDER_DELETE,
        PermissionCode.QUIZ_VIEW,
        PermissionCode.QUIZ_MANAGE,
        PermissionCode.REQUEST_CREATE,
        PermissionCode.REQUEST_READ_OWN,
        PermissionCode.REQUEST_RESPOND,
        PermissionCode.REQUEST_FORWARD,
        PermissionCode.REQUEST_CONFIG,
        PermissionCode.CLASS_SESSION_READ,
        PermissionCode.CLASS_SESSION_WRITE,
        PermissionCode.CLASS_SESSION_HOST,
        PermissionCode.CLASS_SESSION_JOIN,
        PermissionCode.TICKET_RESPOND,
        PermissionCode.TICKET_VIEW_ALL,
        PermissionCode.FAQ_READ,
        PermissionCode.FAQ_WRITE,
    ],
    "admin": list(PermissionCode),  # all permissions
}


def get_permission_codes() -> list[str]:
    return [cast(str, p.code.value) for p in PERMISSION_REGISTRY]


def get_default_role_permissions(role_name: str) -> list[PermissionCode]:
    return list(DEFAULT_ROLE_PERMISSIONS.get(role_name.lower(), []))


def sync_permissions_to_db(db) -> None:
    """Upsert registered permissions into the database.

    Only adds missing permissions; never deletes or overwrites existing ones.
    Resets the PostgreSQL sequence first to avoid ID collisions with
    manually-assigned IDs (34-40) from migration f6dc191f9a13.
    """
    import sqlalchemy as sa
    from app.modules.users.models import Permission

    max_id = db.execute(sa.text("SELECT COALESCE(MAX(id), 0) FROM permissions")).scalar_one()
    db.execute(sa.text(f"SELECT setval('permissions_id_seq', GREATEST({max_id} + 1, 1), false)"))
    db.commit()

    existing = {p.code for p in db.query(Permission.code).all()}
    missing = []
    for meta in PERMISSION_REGISTRY:
        code = str(meta.code.value)
        if code not in existing:
            missing.append(
                Permission(
                    code=code,
                    name=meta.name,
                    description=meta.description,
                    module=meta.module,
                )
            )
    if missing:
        db.add_all(missing)
        db.commit()
