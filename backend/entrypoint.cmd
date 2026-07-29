@echo off
echo [entrypoint] Running Alembic migrations...
alembic upgrade head
if %ERRORLEVEL% neq 0 (
    echo [entrypoint] Migration failed. Exiting.
    exit /b %ERRORLEVEL%
)
echo [entrypoint] Starting Uvicorn...
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --log-level info
