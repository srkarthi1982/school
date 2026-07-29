@echo off
setlocal
REM Always run from this script's directory so .venv/.env resolve correctly
REM even when invoked from another folder or a deploy script.
pushd "%~dp0"

REM Check if uv virtual environment exists
if not exist ".venv" (
    where uv >nul 2>&1
    if not errorlevel 1 (
        echo Virtual environment not found. Creating via uv sync...
        uv sync
        if errorlevel 1 (
            echo ERROR: uv sync failed.
            popd
            exit /b 1
        )
    ) else (
        echo uv is not installed. Creating .venv with Python 3.12...
        py -3.12 -m venv .venv
        if errorlevel 1 (
            echo ERROR: Python 3.12 is required to create .venv.
            popd
            exit /b 1
        )
        ".venv\Scripts\python.exe" -m pip install -r requirements.txt
        if errorlevel 1 (
            echo ERROR: Dependency installation failed.
            popd
            exit /b 1
        )
    )
)

REM Check if .env file exists
if not exist ".env" (
    echo ERROR: .env file not found.
    echo Please copy using 'copy .env.example .env' and modify .env as needed.
    popd
    exit /b 1
)

REM Some Windows developer tools set DEBUG=release globally. Pydantic expects
REM this application's DEBUG setting to be a boolean, so let .env supply it
REM whenever the inherited value is neither true nor false.
if defined DEBUG (
    if /I not "%DEBUG%"=="true" (
        if /I not "%DEBUG%"=="false" (
            echo Ignoring invalid inherited DEBUG=%DEBUG%; using .env instead.
            set "DEBUG="
        )
    )
)

REM Run uvicorn through the venv's python.exe directly (not the uvicorn/uv
REM wrappers). The process that owns the port is then a plain python.exe
REM tree, which stop-server.bat / stop-server.ps1 can always kill by port.
echo Starting server with uvicorn...
echo Logs are also written to logs\app.log (daily rotation) - no output redirection needed.
".venv\Scripts\python.exe" -m uvicorn app.main:app %*

popd
