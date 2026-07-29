<#
.SYNOPSIS
    Deploy JAI-School on Windows Server.

.DESCRIPTION
    Deploy flow:
      1. (optional, -Checkout) fresh clone of -RepoUrl into -TargetDir and
         checkout of -Branch. Fails if -TargetDir already exists.
      2. Provision backend\.env and frontend\.env: skipped when they already
         exist; otherwise copied from -EnvSourceDir, or from each folder's
         .env.example when -EnvSourceDir is not given.
      3. backend: uv sync (skipped when .venv already exists).
      4. backend: alembic upgrade head.
      5. backend: free <Port> first (backend\stop-server.ps1 kills whatever
         process tree owns it), then start-server.bat --host <BindHost>
         --port <Port> launched in a separate process, then poll
         http://localhost:<Port>/openapi.json
         until the server answers. The frontend build fetches openapi.json and
         permission codes from the live backend, so it must be up first.
      6. frontend: npm install, then npm run build:full.

.PARAMETER Checkout
    Perform a fresh clone first. Requires -RepoUrl and -Branch.

.PARAMETER RepoUrl
    Git URL to clone. Mandatory when -Checkout is set.

.PARAMETER Branch
    Branch to checkout. Mandatory when -Checkout is set.

.PARAMETER TargetDir
    Clone destination (only used with -Checkout). Default: .\jai-school.
    Must not already exist.

.PARAMETER EnvSourceDir
    Folder containing the .env files to copy when backend\.env / frontend\.env
    are missing. Looks for backend\.env and frontend\.env subpaths first, then
    .env.backend / .env.frontend flat files. When omitted, .env.example is
    copied to .env in each folder instead.

.PARAMETER BindHost
    Host for uvicorn to bind (alias: -Host is reserved by PowerShell, so use
    -BindHost). Default: 0.0.0.0.

.PARAMETER Port
    Port for uvicorn to bind. Default: 8000.

.PARAMETER HealthTimeoutSec
    How long to wait for the backend to answer before failing. Default: 120.

.EXAMPLE
    .\scripts\deploy.ps1
    # Deploy from the working copy this script lives in.

.EXAMPLE
    .\scripts\deploy.ps1 -Checkout -RepoUrl https://aitfs.jac.mil.ae/JAC-AI/JAI-School/_git/jai-school -Branch develop -TargetDir C:\apps\jai-school
    # Fresh clone + deploy.
#>

[CmdletBinding()]
param(
    [switch]$Checkout,
    [string]$RepoUrl,
    [string]$Branch,
    [string]$TargetDir = '.\jai-school',
    [string]$EnvSourceDir,
    [string]$BindHost = '0.0.0.0',
    [int]$Port = 8000,
    [int]$HealthTimeoutSec = 120
)

$ErrorActionPreference = 'Stop'

function Step([string]$Message) {
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

# --- Step 1: fresh checkout (only with -Checkout) ---------------------------
if ($Checkout) {
    if (-not $RepoUrl) { Fail '-RepoUrl is mandatory when -Checkout is set.' }
    if (-not $Branch)  { Fail '-Branch is mandatory when -Checkout is set.' }
    if (Test-Path $TargetDir) {
        Fail "Target folder '$TargetDir' already exists. Remove it first, then re-run (fresh clone requires an empty destination)."
    }

    Step "Cloning $RepoUrl (branch $Branch) into $TargetDir"
    git clone --branch $Branch $RepoUrl $TargetDir
    if ($LASTEXITCODE -ne 0) { Fail "git clone failed (exit $LASTEXITCODE)." }

    $repoRoot = (Resolve-Path $TargetDir).Path
} else {
    # Assume this script lives in <repo>\scripts\ of an existing working copy.
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    Step "Using existing working copy at $repoRoot (no -Checkout)"
}

$backendDir  = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
if (-not (Test-Path $backendDir))  { Fail "backend folder not found at $backendDir" }
if (-not (Test-Path $frontendDir)) { Fail "frontend folder not found at $frontendDir" }

# --- Step 2: .env provisioning ---------------------------------------------
function Ensure-EnvFile([string]$AppDir, [string]$AppName) {
    $envFile = Join-Path $AppDir '.env'
    if (Test-Path $envFile) {
        Write-Host "  $AppName\.env already exists - skipping."
        return
    }

    if ($EnvSourceDir) {
        $candidates = @(
            (Join-Path $EnvSourceDir "$AppName\.env"),
            (Join-Path $EnvSourceDir ".env.$AppName")
        )
        $source = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
        if (-not $source) {
            Fail "No .env for $AppName found in '$EnvSourceDir' (looked for: $($candidates -join ', '))."
        }
        Copy-Item $source $envFile
        Write-Host "  Copied $source -> $AppName\.env"
    } else {
        $example = Join-Path $AppDir '.env.example'
        if (-not (Test-Path $example)) { Fail "$AppName\.env.example not found at $example" }
        Copy-Item $example $envFile
        Write-Host "  Copied $AppName\.env.example -> $AppName\.env (no -EnvSourceDir given; review the defaults!)"
    }
}

Step 'Provisioning .env files'
Ensure-EnvFile $backendDir 'backend'
Ensure-EnvFile $frontendDir 'frontend'

# --- Step 3: backend dependencies (uv sync) ---------------------------------
Step 'Backend dependencies'
if (Test-Path (Join-Path $backendDir '.venv')) {
    Write-Host '  backend\.venv already exists - skipping uv sync.'
} else {
    Push-Location $backendDir
    try {
        uv sync
        if ($LASTEXITCODE -ne 0) { Fail "uv sync failed (exit $LASTEXITCODE)." }
    } finally { Pop-Location }
}

# --- Step 4: database migrations --------------------------------------------
Step 'Running alembic upgrade head'
Push-Location $backendDir
try {
    uv run alembic upgrade head
    if ($LASTEXITCODE -ne 0) { Fail "alembic upgrade head failed (exit $LASTEXITCODE)." }
} finally { Pop-Location }

# --- Step 5: start backend in a separate process -----------------------------
# Free the port first: stop-server.ps1 kills the process tree that owns it
# (safe parent-walk; won't touch this shell) and rechecks until the port is
# actually free.
Step "Ensuring port $Port is free"
& (Join-Path $backendDir 'stop-server.ps1') -Port $Port
if ($LASTEXITCODE -ne 0) {
    Fail "Port $Port is still occupied after trying to kill its owner. Free it manually, then re-run."
}

Step "Starting backend: start-server.bat --host $BindHost --port $Port"
Start-Process -FilePath (Join-Path $backendDir 'start-server.bat') `
    -ArgumentList "--host $BindHost --port $Port" `
    -WorkingDirectory $backendDir

$healthUrl = "http://localhost:$Port/openapi.json"
Write-Host "  Waiting for backend at $healthUrl (timeout ${HealthTimeoutSec}s)..."
$deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $null = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 3
    }
}
if (-not $ready) {
    Fail "Backend did not become ready at $healthUrl within ${HealthTimeoutSec}s. Check the server window / backend\logs\app.log."
}
Write-Host '  Backend is up.'

# The frontend build fetches types from VITE_BACKEND_URL in frontend\.env;
# warn when that URL points at a different port than the server we started.
$frontendEnv = Join-Path $frontendDir '.env'
$backendUrlLine = Select-String -Path $frontendEnv -Pattern '^\s*VITE_BACKEND_URL\s*=\s*(\S+)' | Select-Object -First 1
if ($backendUrlLine) {
    $viteUrl = $backendUrlLine.Matches[0].Groups[1].Value
    if ($viteUrl -notmatch ":$Port(/|$)") {
        Write-Warning "frontend\.env VITE_BACKEND_URL is '$viteUrl' but the backend was started on port $Port. 'npm run build:full' fetches openapi.json from that URL and may fail or use a stale backend."
    }
}

# --- Step 6: frontend install + build ----------------------------------------
Step 'Frontend: npm install'
Push-Location $frontendDir
try {
    npm install
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed (exit $LASTEXITCODE)." }

    Step 'Frontend: npm run build:full'
    npm run build:full
    if ($LASTEXITCODE -ne 0) { Fail "npm run build:full failed (exit $LASTEXITCODE)." }
} finally { Pop-Location }

# --- Done --------------------------------------------------------------------
Step 'Deploy complete'
Write-Host "  Backend running at http://${BindHost}:$Port (serves frontend\dist)."
Write-Host "  Frontend build output: $frontendDir\dist"
