<#
.SYNOPSIS
    Shared helpers for the JAI-School PostgreSQL backup scripts.

.DESCRIPTION
    Dot-source this file from the backup scripts:

        . (Join-Path $PSScriptRoot 'lib.ps1')

    It provides:
      - Get-DbConfig          parse DATABASE_URL from backend\.env
      - Resolve-PgBin         locate the PostgreSQL 17 bin directory
      - Write-BackupEvent     write to the Windows Application event log
      - Invoke-WithPgPassword run a scriptblock with $env:PGPASSWORD set,
                              then always clear it (never echoed / logged)

    Credentials come from the app's own backend\.env so there is a single
    source of truth for the connection string - the same file deploy.ps1
    places. Nothing here prints the password.
#>

Set-StrictMode -Version Latest

# Event Log source shared by every backup script. Install-BackupTasks.ps1
# registers it (New-EventLog) with Administrator rights; the daily/weekly
# scripts only write to it.
$script:BackupEventSource = 'JAI-School-Backup'
$script:BackupEventLog    = 'Application'

function Get-RepoRoot {
    # scripts\backup\lib.ps1 -> repo root is two levels up.
    return (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
}

function Get-DbConfig {
    <#
    .SYNOPSIS
        Parse DATABASE_URL from backend\.env into its parts.
    .OUTPUTS
        [pscustomobject] with Host, Port, Database, User, Password.
        Password is present but callers must not log it.
    #>
    [CmdletBinding()]
    param(
        [string]$EnvFile
    )

    if (-not $EnvFile) {
        $EnvFile = Join-Path (Get-RepoRoot) 'backend\.env'
    }
    if (-not (Test-Path -LiteralPath $EnvFile)) {
        throw "backend .env not found: $EnvFile"
    }

    # Grab the DATABASE_URL line (first non-comment match). Tolerate optional
    # surrounding quotes and CRLF.
    $line = Get-Content -LiteralPath $EnvFile |
        Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } |
        Select-Object -First 1
    if (-not $line) {
        throw "DATABASE_URL not found in $EnvFile"
    }

    $raw = ($line -replace '^\s*DATABASE_URL\s*=', '').Trim().Trim('"').Trim("'")

    # [uri] parses the postgresql:// URL; UserInfo/Host/Port/AbsolutePath give us
    # the pieces. Percent-encoded values (e.g. a password with @ or /) are
    # decoded with UnescapeDataString.
    try {
        $uri = [uri]$raw
    } catch {
        throw "DATABASE_URL is not a valid URL: $($_.Exception.Message)"
    }

    $userInfo = $uri.UserInfo
    $user = ''
    $password = ''
    if ($userInfo) {
        $idx = $userInfo.IndexOf(':')
        if ($idx -ge 0) {
            $user     = [uri]::UnescapeDataString($userInfo.Substring(0, $idx))
            $password = [uri]::UnescapeDataString($userInfo.Substring($idx + 1))
        } else {
            $user = [uri]::UnescapeDataString($userInfo)
        }
    }

    $database = $uri.AbsolutePath.TrimStart('/')
    if (-not $database) {
        throw "DATABASE_URL has no database name: $raw"
    }

    $dbHost = if ($uri.Host) { $uri.Host } else { 'localhost' }
    $port   = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

    return [pscustomobject]@{
        Host     = $dbHost
        Port     = $port
        Database = $database
        User     = $user
        Password = $password
    }
}

function Resolve-PgBin {
    <#
    .SYNOPSIS
        Return the PostgreSQL bin directory containing pg_dump.exe etc.
    .DESCRIPTION
        Order: explicit -PgBin param, then PG_BIN env var, then the default
        PostgreSQL 17 install path, then whatever pg_dump is on PATH.
    #>
    [CmdletBinding()]
    param(
        [string]$PgBin
    )

    $candidates = @()
    if ($PgBin)      { $candidates += $PgBin }
    if ($env:PG_BIN) { $candidates += $env:PG_BIN }
    $candidates += 'C:\Program Files\PostgreSQL\17\bin'

    foreach ($c in $candidates) {
        if ($c -and (Test-Path -LiteralPath (Join-Path $c 'pg_dump.exe'))) {
            return (Resolve-Path -LiteralPath $c).Path
        }
    }

    # Fall back to PATH.
    $onPath = Get-Command 'pg_dump.exe' -ErrorAction SilentlyContinue
    if ($onPath) {
        return (Split-Path -Parent $onPath.Source)
    }

    throw "Could not locate pg_dump.exe. Pass -PgBin, set PG_BIN, or install PostgreSQL 17 at 'C:\Program Files\PostgreSQL\17\bin'."
}

function Write-BackupEvent {
    <#
    .SYNOPSIS
        Write to the Application event log under the backup source.
    .DESCRIPTION
        Event id convention shared across the backup scripts:
          100  Information  - a job succeeded
          150  Warning      - degraded (e.g. stale backup, low disk)
          200  Error        - a job failed
        Silently degrades to Write-Host if the source is not registered yet
        (Install-BackupTasks.ps1 registers it).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][int]$EventId,
        [Parameter(Mandatory)][ValidateSet('Information', 'Warning', 'Error')][string]$EntryType,
        [Parameter(Mandatory)][string]$Message
    )

    $color = switch ($EntryType) {
        'Error'   { 'Red' }
        'Warning' { 'Yellow' }
        default   { 'Gray' }
    }
    Write-Host "[$EntryType] $Message" -ForegroundColor $color

    try {
        Write-EventLog -LogName $script:BackupEventLog -Source $script:BackupEventSource `
            -EventId $EventId -EntryType $EntryType -Message $Message -ErrorAction Stop
    } catch {
        # Source not registered (or no rights). Don't let logging failure mask
        # the real work; the Write-Host above still surfaces it.
        Write-Host "  (event log source '$script:BackupEventSource' unavailable: $($_.Exception.Message))" -ForegroundColor DarkGray
    }
}

function Invoke-WithPgPassword {
    <#
    .SYNOPSIS
        Run a scriptblock with $env:PGPASSWORD set from the parsed config, then
        always clear it. Keeps the password out of the command line and out of
        any log.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Password,
        [Parameter(Mandatory)][scriptblock]$Body
    )
    $had = Test-Path Env:PGPASSWORD
    $prev = if ($had) { $env:PGPASSWORD } else { $null }
    try {
        $env:PGPASSWORD = $Password
        & $Body
    } finally {
        if ($had) { $env:PGPASSWORD = $prev } else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
    }
}
