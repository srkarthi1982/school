from __future__ import annotations

from typing import Any

from app.modules.agent.context import UserContext
from app.modules.agent.tools.registry import tool

# Catalog of interactive "Show me how" walkthroughs the chat UI can run.
#
# Each id MUST match a guide in the frontend registry at
# frontend/src/infra/guides/registry.ts — that registry owns the concrete
# routes and element selectors; this catalog only tells the LLM which guides
# exist, what they do, and the textual steps to teach. When the model offers a
# guide it emits a fenced ```guide {"id": "<id>"} ``` block, which the chat
# bubble turns into a "Show me how" button.
#
# `permission` gates whether a guide is offered to a given user; it is a raw
# permission-code string (or a list of codes, any of which grants access)
# matching PermissionCode values and the frontend registry's `permissions`.
# None means "available to everyone".
_GUIDES: list[dict[str, Any]] = [
    {
        "id": "create-quiz",
        "title": "Create a quiz",
        "description": "Create a new quiz in the Quiz Bank.",
        "permission": "quiz:manage",
        "steps": [
            "In the left sidebar, open the Assignment & Assessment module.",
            "Pick the Quiz Bank section from the submenu.",
            "Click the Create Quiz button to start building a new quiz, then fill in the form.",
        ],
    },
    {
        "id": "create-personal-request",
        "title": "Create a personal request",
        "description": "Submit a new personal request from Communication & Reporting.",
        "permission": "request:create",
        "steps": [
            "In the left sidebar, open the Communication & Reporting module.",
            "Pick the Personal Request section from the submenu.",
            "Click the New Personal Request button to open the request form, then fill it in.",
        ],
    },
    {
        "id": "check-schedule",
        "title": "Check my schedule",
        "description": "Open the calendar and view your schedule.",
        "permission": "schedule_entry:read",
        "steps": [
            "In the left sidebar, open the Dashboard & Scheduling module.",
            "Pick the Schedule Management section from the submenu.",
            "Switch between Day, Week, and Month views and click a block to see lesson details.",
        ],
    },
    {
        "id": "take-quiz",
        "title": "Take a quiz",
        "description": "Find and take a quiz from the Quiz Bank.",
        "permission": "quiz:take",
        "steps": [
            "In the left sidebar, open the Assignment & Assessment module.",
            "Pick the Quiz Bank section from the submenu.",
            "Select a quiz from the list, then click Take Quiz to start answering.",
        ],
    },
    {
        "id": "view-grades",
        "title": "View my grades",
        "description": "Review your grades and attendance.",
        "permission": "student:read",
        "steps": [
            "In the left sidebar, open the Grading & Attendance module.",
            "On the My Grades tab, review your average grade, present rate, absences, and per-subject progress.",
        ],
    },
    {
        "id": "start-chat",
        "title": "Start a chat",
        "description": "Open the Chat and start a conversation.",
        "permission": None,
        "steps": [
            "In the left sidebar, open the Communication & Reporting module.",
            "Pick the Chat section from the submenu.",
            "Choose a conversation and start typing in the composer at the bottom.",
        ],
    },
    {
        "id": "share-file",
        "title": "Share a file",
        "description": "Upload and share a file from File Sharing.",
        "permission": "file:read",
        "steps": [
            "In the left sidebar, open the Communication & Reporting module.",
            "Pick the File Sharing section from the submenu.",
            "Click the Upload File button and choose the file you want to share.",
        ],
    },
    {
        "id": "change-password",
        "title": "Change my password",
        "description": "Change your account password from your profile page.",
        "permission": ["student:read", "teacher:read"],
        "steps": [
            "In the left sidebar, open the Profile & General Info page.",
            "Click the Change Password button, then enter your old and new passwords.",
        ],
    },
    {
        "id": "edit-profile",
        "title": "Edit my profile",
        "description": "Update your personal details from your profile page.",
        "permission": ["student:read", "teacher:read"],
        "steps": [
            "In the left sidebar, open the Profile & General Info page.",
            "Click the Edit Profile button, then update your details and save.",
        ],
    },
    {
        "id": "view-dashboard",
        "title": "View the dashboard",
        "description": "Open the dashboard with statistics for your role.",
        "permission": [
            "dashboard:leadership",
            "dashboard:sat",
            "dashboard:instructor",
            "dashboard:student",
        ],
        "steps": [
            "In the left sidebar, open the Dashboard & Scheduling module.",
            "Pick the Dashboard section from the submenu.",
            "Review the dashboard widgets and statistics for your role.",
        ],
    },
    {
        "id": "view-progress-tracker",
        "title": "View the progress tracker",
        "description": "Track course and lesson progress in the Progress Tracker.",
        "permission": [
            "progress_tracker:student",
            "progress_tracker:teacher",
            "progress_tracker:admin",
        ],
        "steps": [
            "In the left sidebar, open the Dashboard & Scheduling module.",
            "Pick the Progress Tracker section from the submenu.",
            "Review the progress overview and click a course to drill down into its lessons.",
        ],
    },
    {
        "id": "create-course-builder",
        "title": "Create a course master",
        "description": "Create a new course master in Course Builder.",
        "permission": "course_master:write",
        "steps": [
            "In the left sidebar, open the Course Management module.",
            "Pick the Course Builder section from the submenu.",
            "Click the Add button to create a new course master, then fill in the form.",
        ],
    },
    {
        "id": "create-course-selection",
        "title": "Create a course iteration",
        "description": "Create a new course iteration in Course Selection.",
        "permission": "course:write",
        "steps": [
            "In the left sidebar, open the Course Management module.",
            "Pick the Course Selection section from the submenu.",
            "Click the Add button to create a new course iteration from a course master.",
        ],
    },
    {
        "id": "view-enrolled-students",
        "title": "View enrolled students",
        "description": "Browse the students enrolled in your courses.",
        "permission": "student:read",
        "steps": [
            "In the left sidebar, open the Course Management module.",
            "Pick the Enrolled Students section from the submenu.",
            "Browse the list of enrolled students and use the filters to narrow it down.",
        ],
    },
    {
        "id": "view-library",
        "title": "View the library",
        "description": "Browse and read documents in the material library.",
        "permission": None,
        "steps": [
            "In the left sidebar, open the Course Management module.",
            "Pick the Library section from the submenu.",
            "Browse the library and click a document to open it in the reader.",
        ],
    },
    {
        "id": "create-form",
        "title": "Create a form",
        "description": "Create a new form in the Form section.",
        "permission": "form:creator",
        "steps": [
            "In the left sidebar, open the Grading & Attendance module.",
            "Pick the Form section from the submenu.",
            "Click the Create Form button, then fill in the form details.",
        ],
    },
    {
        "id": "view-form",
        "title": "View a form",
        "description": "Open a form and review its questions and details.",
        "permission": "form:view",
        "steps": [
            "In the left sidebar, open the Grading & Attendance module.",
            "Pick the Form section from the submenu.",
            "Select a form from the list to view its questions and details.",
        ],
    },
    {
        "id": "take-form",
        "title": "Take a form",
        "description": "Find and fill in a form sent to you.",
        "permission": "form:take",
        "steps": [
            "In the left sidebar, open the Grading & Attendance module.",
            "Pick the Form section from the submenu.",
            "Select a form sent to you, then click Take Form to start answering.",
        ],
    },
    {
        "id": "create-survey",
        "title": "Create a survey",
        "description": "Create a new survey in the Survey section.",
        "permission": "survey:creator",
        "steps": [
            "In the left sidebar, open the Grading & Attendance module.",
            "Pick the Survey section from the submenu.",
            "Click the Create Survey button, then fill in the survey details.",
        ],
    },
    {
        "id": "view-survey",
        "title": "View a survey",
        "description": "Open a survey and review its questions and details.",
        "permission": "survey:view",
        "steps": [
            "In the left sidebar, open the Grading & Attendance module.",
            "Pick the Survey section from the submenu.",
            "Select a survey from the list to view its questions and details.",
        ],
    },
    {
        "id": "take-survey",
        "title": "Take a survey",
        "description": "Find and fill in a survey sent to you.",
        "permission": "survey:take",
        "steps": [
            "In the left sidebar, open the Grading & Attendance module.",
            "Pick the Survey section from the submenu.",
            "Select a survey sent to you, then click Take Survey to start answering.",
        ],
    },
    {
        "id": "view-attendance",
        "title": "View attendance",
        "description": "Review class attendance records.",
        "permission": "attendance:read",
        "steps": [
            "In the left sidebar, open the Grading & Attendance module.",
            "Pick the Class Attendance section from the submenu.",
            "Review the attendance records and use the filters to narrow them down.",
        ],
    },
    {
        "id": "create-virtual-classroom",
        "title": "Create a virtual classroom session",
        "description": "Schedule a new virtual classroom session.",
        "permission": "class_session:write",
        "steps": [
            "In the left sidebar, open the Communication & Reporting module.",
            "Pick the Virtual Classroom section from the submenu.",
            "Click the Create Session button, then fill in the session details.",
        ],
    },
    {
        "id": "join-virtual-classroom",
        "title": "Join a virtual classroom",
        "description": "Join a live virtual classroom session.",
        "permission": "class_session:join",
        "steps": [
            "In the left sidebar, open the Communication & Reporting module.",
            "Pick the Virtual Classroom section from the submenu.",
            "Find a live session and click Open live view to join it.",
        ],
    },
    {
        "id": "view-external-link",
        "title": "View external apps",
        "description": "Open the External Link page with shortcuts to external apps.",
        "permission": ["student:read", "teacher:read"],
        "steps": [
            "In the left sidebar, open the External Link page.",
            "Choose an external app and click Open to launch it.",
        ],
    },
]


@tool(
    name="list_ui_guides",
    description=(
        "List the interactive step-by-step walkthroughs ('Show me how' guides) "
        "available to this user for using the JAI Information System. Call this "
        "for 'how do I…' questions about performing a task in the system (e.g. "
        "creating a quiz or a request). Returns each guide's id, title, "
        "description, and textual steps. To offer a guide, teach the steps in "
        "text and then reference its exact id as instructed in the system prompt."
    ),
    parameters={"type": "object", "properties": {}},
    status_label="Looking up interactive guides…",
)
def list_ui_guides(ctx: UserContext, args: dict[str, Any]) -> Any:
    """Return the guides this user is allowed to run.

    Permission-gated guides are dropped when the user lacks the permission, so
    the model never offers a walkthrough the user cannot complete (the frontend
    re-checks the same permission before rendering the button — defence in
    depth)."""

    def _allowed(permission: str | list[str] | None) -> bool:
        if permission is None:
            return True
        codes = [permission] if isinstance(permission, str) else permission
        return ctx.has_permission(*codes)

    guides = [
        {
            "id": g["id"],
            "title": g["title"],
            "description": g["description"],
            "steps": g["steps"],
        }
        for g in _GUIDES
        if _allowed(g["permission"])
    ]
    return {"guides": guides}
