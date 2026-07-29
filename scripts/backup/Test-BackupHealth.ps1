<#
.SYNOPSIS
    Daily health check for the JAI-School PostgreSQL backups.

.DESCRIPTION
    Verifies the backups are actually being produced and there is room to keep
    producing them - the failure modes that are otherwise silent:

      1. Newest logical dump older than -MaxDumpAgeHours (default 26).
      2. Newest base backup older than -MaxBaseAgeDays (default 8).
      3. Free space on the backup volume below -MinFreeGB (default 10).

    Each problem writes a Warning (event id 150); a clean run writes an
    Information (id 100). Intended to run daily and be surfaced by whatever
    watches the Windows Application event log (LAN monitoring agent / on-call).

    Exit code is 0 when healthy, 1 when any check fails - so a scheduled task's
    "last run result" also reflects health.

.PARAMETER BackupRoot
    Root backup directory (same value passed to the backup scripts). Required.

.PARAMETER MaxDumpAgeHours
    Warn if the newest logical dump is older than this. Default 26.

.PARAMETER MaxBaseAgeDays
    Warn if the newest base backup is older than this. Default 8.

.PARAMETER MinFreeGB
    Warn if free space on the backup volume is below this. Default 10.

.EXAMPLE
    .\Test-BackupHealth.ps1 -BackupRoot D:\pg_backups
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupRoot,
    [double]$MaxDumpAgeHours = 26,
    [double]$MaxBaseAgeDays  = 8,
    [double]$MinFreeGB       = 10
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib.ps1')

$problems = @()

function Get-Newest {
    param([string]$Path, [string]$Filter, [ValidateSet('File', 'Directory')][string]$Kind)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $items = if ($Kind -eq 'Directory') {
        Get-ChildItem -LiteralPath $Path -Directory
    } else {
        Get-ChildItem -LiteralPath $Path -File
    }
    return $items | Where-Object { $_.Name -like $Filter } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

try {
    $cfg = Get-DbConfig
    $now = Get-Date

    # 1. Logical dump freshness (accept encrypted .7z variants too).
    $logicalDir = Join-Path $BackupRoot 'logical'
    $newestDump = Get-Newest -Path $logicalDir -Filter "$($cfg.Database)_*" -Kind File
    if (-not $newestDump) {
        $problems += "No logical dump found under $logicalDir."
    } else {
        $ageH = [math]::Round(($now - $newestDump.LastWriteTime).TotalHours, 1)
        if ($ageH -gt $MaxDumpAgeHours) {
            $problems += "Newest logical dump is ${ageH}h old (> ${MaxDumpAgeHours}h): $($newestDump.Name)."
        } else {
            Write-Host "Logical dump OK: $($newestDump.Name) (${ageH}h old)" -ForegroundColor Green
        }
    }

    # 2. Base backup freshness.
    $baseDir = Join-Path $BackupRoot 'base'
    $newestBase = Get-Newest -Path $baseDir -Filter 'base_*' -Kind Directory
    if (-not $newestBase) {
        $problems += "No base backup found under $baseDir."
    } else {
        $ageD = [math]::Round(($now - $newestBase.LastWriteTime).TotalDays, 1)
        if ($ageD -gt $MaxBaseAgeDays) {
            $problems += "Newest base backup is ${ageD}d old (> ${MaxBaseAgeDays}d): $($newestBase.Name)."
        } else {
            Write-Host "Base backup OK: $($newestBase.Name) (${ageD}d old)" -ForegroundColor Green
        }
    }

    # 3. Free space on the backup volume.
    $rootItem = Get-Item -LiteralPath $BackupRoot -ErrorAction SilentlyContinue
    if ($rootItem) {
        $driveName = $rootItem.PSDrive.Name
        $drive = Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
        if ($drive -and $null -ne $drive.Free) {
            $freeGb = [math]::Round($drive.Free / 1GB, 1)
            if ($freeGb -lt $MinFreeGB) {
                $problems += "Backup volume ${driveName}: has only ${freeGb} GB free (< ${MinFreeGB} GB)."
            } else {
                Write-Host "Free space OK: ${driveName}: ${freeGb} GB free" -ForegroundColor Green
            }
        }
    } else {
        $problems += "BackupRoot does not exist: $BackupRoot."
    }

    if ($problems.Count -gt 0) {
        Write-BackupEvent -EventId 150 -EntryType Warning `
            -Message ("Backup health check found $($problems.Count) issue(s):`n - " + ($problems -join "`n - "))
        exit 1
    }

    Write-BackupEvent -EventId 100 -EntryType Information `
        -Message "Backup health check passed (dump and base fresh, disk space OK)."
    exit 0
}
catch {
    Write-BackupEvent -EventId 200 -EntryType Error `
        -Message "Backup health check ERRORED: $($_.Exception.Message)"
    exit 1
}
