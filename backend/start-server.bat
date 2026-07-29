@echo off
setlocal
REM Always run from this script's directory so .venv/.env resolve correctly
REM even when invoked from another folder or a deploy script.
pushd "%~dp0"

REM Check if uv virtual environment exists
if not exist ".venv" (
    echo uv venv not found. Creating via uv sync...
    uv sync
)

REM Check if .env file exists
if not exist ".env" (
    echo ERROR: .env file not found.
    echo Please copy using 'copy .env.example .env' and modify .env as needed.
    popd
    exit /b 1
)

REM Run uvicorn through the venv's python.exe directly (not the uvicorn/uv
REM wrappers). The process that owns the port is then a plain python.exe
REM tree, which stop-server.bat / stop-server.ps1 can always kill by port.
echo Starting server with uvicorn...
echo Logs are also written to logs\app.log (daily rotation) - no output redirection needed.
".venv\Scripts\python.exe" -m uvicorn app.main:app %*

popd
