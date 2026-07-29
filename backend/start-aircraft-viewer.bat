@echo off
setlocal
pushd "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo ERROR: backend virtual environment was not found.
    popd
    exit /b 1
)

REM Protect local startup from a machine-level DEBUG=release variable.
set "DEBUG=true"
set "AIRCRAFT_VIEWER_ENABLED=true"

echo Starting database-free JAI Aircraft Viewer...
echo URL: http://localhost:8000/api/v1/aircraft-viewer/?name=aircraft_viewer

".venv\Scripts\python.exe" -m uvicorn app.aircraft_viewer_app:app --host 0.0.0.0 --port 8000 %*

popd
