@echo off
setlocal
REM Stop Server Script
REM Usage: stop-server [port] - if port not provided, defaults to 8000
REM Delegates to stop-server.ps1, which kills the whole process tree that
REM owns the port (python/uvicorn/uv wrappers included).

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

echo Stopping uvicorn server on port %PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-server.ps1" -Port %PORT%
exit /b %ERRORLEVEL%
