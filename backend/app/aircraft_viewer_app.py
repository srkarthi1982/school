"""Database-free development host for the isolated aircraft viewer."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.modules.aircraft_viewer import router as aircraft_viewer_router


app = FastAPI(
    title="JAI Aircraft Viewer",
    description="Database-free development host for the static aircraft viewer.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(aircraft_viewer_router)


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "mode": "aircraft-viewer-only",
    }
