from contextvars import ContextVar

# Holds the authenticated user's ID for the duration of a request.
# Set by get_current_user in deps.py; read by the audit flush listener.
current_user_id_var: ContextVar[int | None] = ContextVar("current_user_id", default=None)
