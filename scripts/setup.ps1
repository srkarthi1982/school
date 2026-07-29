#Requires -Version 5.1
<#
.SYNOPSIS
    Prepares the jai-school repository to be started (backend + frontend).

.DESCRIPTION
    Temporarily disables the internal package indexes / lock files so that
    dependencies resolve from public sources, sets up the backend (uv sync,
    alembic migrations, seed users) and the frontend (npm install), then
    reverts all temporary changes so the working tree is left clean.

    Steps 11-13 (the reverts) always run, even if an earlier step fails.
#>

$ErrorActionPreference = 'Stop'

# Resolve important paths. The script lives in <repo>\scripts, so the repo
# root is the parent of $PSScriptRoot.
$RepoRoot     = Split-Path -Parent $PSScriptRoot
$BackendDir   = Join-Path $RepoRoot 'backend'
$FrontendDir  = Join-Path $RepoRoot 'frontend'

$UvLock       = Join-Path $BackendDir 'uv.lock'
$UvLockBak    = Join-Path $BackendDir 'uv.lock.bak'
$PyProject     = Join-Path $BackendDir 'pyproject.toml'
$PyProjectBak  = Join-Path $BackendDir 'pyproject.toml.setupbak'
$EnvFile       = Join-Path $BackendDir '.env'
$EnvExample    = Join-Path $BackendDir '.env.example'
$PkgLock       = Join-Path $FrontendDir 'package-lock.json'
$PkgLockBak    = Join-Path $FrontendDir 'package-lock.json.bak'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# Track what we changed so the finally block only reverts what it should.
$renamedUvLock   = $false
$patchedPyProj   = $false
$renamedPkgLock  = $false

try {
    # ------------------------------------------------------------------
    # 1. Go to backend folder
    # ------------------------------------------------------------------
    Write-Step "Entering backend folder: $BackendDir"
    Set-Location $BackendDir

    # ------------------------------------------------------------------
    # 2. Rename uv.lock -> uv.lock.bak
    # ------------------------------------------------------------------
    if (Test-Path $UvLock) {
        Write-Step "Renaming uv.lock -> uv.lock.bak"
        if (Test-Path $UvLockBak) { Remove-Item $UvLockBak -Force }
        Rename-Item -Path $UvLock -NewName 'uv.lock.bak'
        $renamedUvLock = $true
    } else {
        Write-Host "uv.lock not found - skipping rename." -ForegroundColor Yellow
    }

    # ------------------------------------------------------------------
    # 3. Comment out the [tool.uv] index-url lines in pyproject.toml
    # ------------------------------------------------------------------
    Write-Step "Commenting internal index-url in pyproject.toml"
    Copy-Item $PyProject $PyProjectBak -Force
    $patchedPyProj = $true

    $lines = Get-Content $PyProject
    $patched = foreach ($line in $lines) {
        if ($line -match '^\s*\[tool\.uv\]\s*$' -or $line -match '^\s*index-url\s*=') {
            '# ' + $line
        } else {
            $line
        }
    }
    # Write UTF-8 WITHOUT a BOM. Windows PowerShell 5.1's `-Encoding utf8`
    # emits a BOM, which Python's tomllib rejects ("Invalid statement at
    # line 1, column 1") when alembic later parses pyproject.toml.
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($PyProject, $patched, $utf8NoBom)

    # ------------------------------------------------------------------
    # 4. uv sync
    # ------------------------------------------------------------------
    Write-Step "Running: uv sync"
    uv sync
    if ($LASTEXITCODE -ne 0) { throw "uv sync failed (exit $LASTEXITCODE)" }

    # ------------------------------------------------------------------
    # 5. Copy .env.example -> .env if .env does not exist
    # ------------------------------------------------------------------
    if (-not (Test-Path $EnvFile)) {
        Write-Step "Creating .env from .env.example"
        Copy-Item $EnvExample $EnvFile
    } else {
        Write-Host ".env already exists - leaving it untouched." -ForegroundColor Yellow
    }

    # ------------------------------------------------------------------
    # 6. Activate the uv virtual environment
    # ------------------------------------------------------------------
    Write-Step "Activating virtual environment (.venv)"
    $activate = Join-Path $BackendDir '.venv\Scripts\Activate.ps1'
    if (-not (Test-Path $activate)) { throw "Activation script not found: $activate" }
    . $activate

    # ------------------------------------------------------------------
    # 7. alembic upgrade head
    # ------------------------------------------------------------------
    Write-Step "Running: alembic upgrade head"
    alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw "alembic upgrade head failed (exit $LASTEXITCODE)" }

    # ------------------------------------------------------------------
    # 8. Seed default users
    # ------------------------------------------------------------------
    Write-Step "Running: python scripts\seed_default_users.py"
    python scripts\seed_default_users.py
    if ($LASTEXITCODE -ne 0) { throw "seed_default_users.py failed (exit $LASTEXITCODE)" }

    # ------------------------------------------------------------------
    # 9. Go to frontend folder
    # ------------------------------------------------------------------
    Write-Step "Entering frontend folder: $FrontendDir"
    Set-Location $FrontendDir

    # ------------------------------------------------------------------
    # 10. Rename package-lock.json -> package-lock.json.bak
    # ------------------------------------------------------------------
    if (Test-Path $PkgLock) {
        Write-Step "Renaming package-lock.json -> package-lock.json.bak"
        if (Test-Path $PkgLockBak) { Remove-Item $PkgLockBak -Force }
        Rename-Item -Path $PkgLock -NewName 'package-lock.json.bak'
        $renamedPkgLock = $true
    } else {
        Write-Host "package-lock.json not found - skipping rename." -ForegroundColor Yellow
    }

    # ------------------------------------------------------------------
    # 11. npm install
    # ------------------------------------------------------------------
    Write-Step "Running: npm install"
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }

    Write-Host "`nSetup completed successfully." -ForegroundColor Green
}
finally {
    # ------------------------------------------------------------------
    # Revert steps (always run). Numbered 11-13 in the request.
    # ------------------------------------------------------------------
    Write-Step "Reverting temporary changes"

    # 11. Restore uv.lock
    if ($renamedUvLock -and (Test-Path $UvLockBak)) {
        if (Test-Path $UvLock) { Remove-Item $UvLock -Force }
        Rename-Item -Path $UvLockBak -NewName 'uv.lock'
        Write-Host "Restored uv.lock" -ForegroundColor Green
    }

    # 12. Restore pyproject.toml
    if ($patchedPyProj -and (Test-Path $PyProjectBak)) {
        Move-Item -Path $PyProjectBak -Destination $PyProject -Force
        Write-Host "Restored pyproject.toml" -ForegroundColor Green
    }

    # 13. Restore package-lock.json
    if ($renamedPkgLock -and (Test-Path $PkgLockBak)) {
        if (Test-Path $PkgLock) { Remove-Item $PkgLock -Force }
        Rename-Item -Path $PkgLockBak -NewName 'package-lock.json'
        Write-Host "Restored package-lock.json" -ForegroundColor Green
    }

    # Return to repo root.
    Set-Location $RepoRoot
}
