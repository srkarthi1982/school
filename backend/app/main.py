import asyncio
import logging
import time
import traceback
import uuid

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.orm.exc import StaleDataError

from app.core.audit import register_audit_listener
from app.core.config import settings
from app.core.limiter import limiter

# Configure CORS origins based on environment
if settings.ALLOW_ALL_ORIGINS:
    CORS_ORIGINS = ["*"]  # Allow all origins in development
    CORS_ALLOW_CREDENTIALS = False  # Required when using "*"
else:
    CORS_ORIGINS = settings.CORS_ORIGINS
    CORS_ALLOW_CREDENTIALS = True

from app.core.logging import request_id_ctx, setup_logging
from app.modules.aircraft_viewer import router as aircraft_viewer_router
from app.modules import create_api_router, import_all_models

setup_logging()
logger = logging.getLogger(__name__)

# Import all models so SQLAlchemy resolves relationships before the listener
# registers itself against the Session class.
import_all_models()
register_audit_listener()

_STATIC_DIR = Path(__file__).parent / "static"
_FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

app = FastAPI(
    title="JAC Aviation Institute Academic Information System",
    description="Backend API for JAI Information System",
    version="0.1.0",
    # Disable built-in CDN-backed docs; custom routes below serve local assets.
    docs_url=None,
    redoc_url=None,
)

app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

if _FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=_FRONTEND_DIST / "assets"), name="frontend-assets")
    if (_FRONTEND_DIST / "fonts").exists():
        app.mount("/fonts", StaticFiles(directory=_FRONTEND_DIST / "fonts"), name="frontend-fonts")
    if (_FRONTEND_DIST / "icons").exists():
        app.mount("/icons", StaticFiles(directory=_FRONTEND_DIST / "icons"), name="frontend-icons")


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=app.openapi_url or "/openapi.json",
        title=f"{app.title} — Swagger UI",
        swagger_js_url="/static/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger-ui.css",
        swagger_favicon_url="",
    )


@app.get("/redoc", include_in_schema=False)
async def custom_redoc() -> HTMLResponse:
    return get_redoc_html(
        openapi_url=app.openapi_url or "/openapi.json",
        title=f"{app.title} — ReDoc",
        redoc_js_url="/static/redoc.standalone.js",
        redoc_favicon_url="",
        with_google_fonts=False,
    )

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Retry"],
    expose_headers=["X-Request-ID"],
)

if settings.AIRCRAFT_VIEWER_ENABLED:
    app.include_router(aircraft_viewer_router)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    request_id_ctx.set(rid)

    start = time.perf_counter()
    logger.info("%s %s", request.method, request.url.path)

    response = await call_next(request)

    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s -> %s (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    # Usage analytics capture — non-blocking, never raises (see tracking.py).
    from app.modules.analytics.tracking import track_request
    track_request(request, response.status_code, duration_ms)

    response.headers["X-Request-ID"] = rid
    return response


_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": code,
                "message": exc.detail,
                "request_id": request_id_ctx.get() or "-",
                "details": [],
            },
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # exc.errors() may contain non-serializable objects (e.g. ValueError in ctx).
    # jsonable_encoder converts them to strings safely.
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": jsonable_encoder(exc.errors()),
            },
        },
    )


@app.exception_handler(StaleDataError)
async def stale_data_handler(request: Request, exc: StaleDataError):
    return JSONResponse(
        status_code=409,
        content={
            "success": False,
            "error": {
                "code": "STALE_DATA",
                "message": "Resource was modified by another request. Reload and retry.",
                "details": [],
            },
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = request_id_ctx.get() or "-"
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)

    error: dict = {
        "code": "INTERNAL_SERVER_ERROR",
        "message": "Internal server error",
        "request_id": rid,
        "details": [],
    }
    # In dev/staging surface the real cause so the UI can explain why it failed.
    # The full traceback is logged regardless; here we expose a trimmed version.
    if settings.DEBUG:
        error["message"] = f"{type(exc).__name__}: {exc}"
        error["details"] = traceback.format_exc().splitlines()[-15:]

    return JSONResponse(
        status_code=500,
        content={"success": False, "error": error},
    )


@app.on_event("startup")
def startup_sync_permissions():
    from app.core.database import SessionLocal
    from app.core.permissions import sync_permissions_to_db
    from app.modules.chat.common.services import cleanup_orphan_attachments
    from app.modules.library.scheduler import start_scheduler as start_library_scheduler
    from app.modules.request.scheduler import start_scheduler as start_request_scheduler
    from app.modules.analytics.scheduler import start_scheduler as start_analytics_scheduler
    from app.modules.rag.scheduler import start_scheduler as start_rag_scheduler

    db = SessionLocal()
    try:
        sync_permissions_to_db(db)
        cleanup_orphan_attachments(db)
    finally:
        db.close()

    start_library_scheduler()
    start_request_scheduler()
    start_analytics_scheduler()
    start_rag_scheduler()


# The MCP session manager's run() context must span the app's lifetime.
_mcp_manager_cm = None


@app.on_event("startup")
async def startup_mcp_session_manager():
    global _mcp_manager_cm
    from app.modules.agent.mcp_server import session_manager

    _mcp_manager_cm = session_manager.run()
    await _mcp_manager_cm.__aenter__()
    logger.info("MCP session manager started (/api/v1/mcp)")


@app.on_event("shutdown")
async def shutdown_mcp_session_manager():
    global _mcp_manager_cm
    if _mcp_manager_cm is not None:
        try:
            await _mcp_manager_cm.__aexit__(None, None, None)
        except Exception:
            logger.exception("MCP session manager shutdown failed")
        _mcp_manager_cm = None


@app.on_event("shutdown")
def shutdown_request_scheduler():
    from app.modules.request.scheduler import stop_scheduler as stop_request_scheduler
    from app.modules.library.scheduler import stop_scheduler as stop_library_schedular
    from app.modules.analytics.scheduler import stop_scheduler as stop_analytics_scheduler

    stop_library_schedular()
    stop_request_scheduler()
    stop_analytics_scheduler()  # also does a final buffer flush


app.include_router(create_api_router(), prefix="/api/v1")

# MCP endpoint for external clients (Claude Desktop, etc.). Mounted as a raw
# ASGI app: PAT auth + streamable-HTTP MCP protocol over the agent tool
# registry, permission-scoped to the token's user.
from app.modules.agent.mcp_server import mcp_asgi_app  # noqa: E402

app.mount("/api/v1/mcp", mcp_asgi_app)


@app.middleware("http")
async def mcp_bare_path_middleware(request: Request, call_next):
    # Starlette's Mount only matches paths under the prefix; the bare
    # /api/v1/mcp would otherwise fall through to the SPA catch-all route.
    if request.scope["path"] == "/api/v1/mcp":
        request.scope["path"] = "/api/v1/mcp/"
    return await call_next(request)

# Inject OAuth2 security scheme at startup (after routers are included)
if not app.openapi_schema:
    app.openapi_schema = app.openapi()
app.openapi_schema["components"] = app.openapi_schema.get("components", {})
app.openapi_schema["components"]["securitySchemes"] = {
    "oauth2": {
        "type": "oauth2",
        "flows": {
            "password": {
                "scopes": {},
                "tokenUrl": "/api/v1/auth/login",
            },
        },
    },
}
# Exclude login endpoint from OAuth2 requirement
for path in app.openapi_schema.get("paths", {}).values():
    for operation in path.values():
        op_id = operation.get("operationId", "")
        if "login" in op_id.lower() and "auth" in op_id.lower():
            operation.pop("security", None)
            # Update response schema to match OAuth2 spec
            if "responses" not in operation:
                operation["responses"] = {}
            operation["responses"]["200"] = {
                "description": "Successful authentication",
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "access_token": {"type": "string", "format": "binary"},
                                "refresh_token": {"type": "string", "format": "binary"},
                                "token_type": {"type": "string", "default": "bearer"},
                            },
                            "required": ["access_token", "token_type"],
                        }
                    }
                },
            }
        elif not operation.get("security"):
            operation["security"] = [{"oauth2": []}]

logger.info("OAuth2 security scheme configured for OpenAPI spec")


@app.get("/health")
def health_check():
    return {"status": "ok"}


if _FRONTEND_DIST.exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        # index.html must NOT be cached by the browser: it references hash-named
        # asset bundles (index-<hash>.js) that change every build. If the browser
        # serves a stale index.html it loads an old bundle whose API calls fall
        # through to this SPA catch-all (returning index.html), which looks like
        # "the feature silently broke". The hashed assets themselves are immutable
        # and remain safely cacheable.
        return FileResponse(
            _FRONTEND_DIST / "index.html",
            headers={"Cache-Control": "no-cache, must-revalidate"},
        )
