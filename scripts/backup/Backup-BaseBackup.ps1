<#
.SYNOPSIS
    Weekly physical base backup of the PostgreSQL cluster (pg_basebackup).

.DESCRIPTION
    Takes a compressed tar-format base backup of the whole cluster into
    <BackupRoot>\base\base_<timestamp>, prunes base backups older than
    -RetentionWeeks, and logs the outcome to the Application event log
    (source JAI-School-Backup).

    -Xs streams the WAL generated during the backup into the backup itself, so
    each snapshot is self-consistent to its finish time and can be restored
    WITHOUT a separate WAL archive. This gives fast whole-cluster disaster
    recovery to the most recent weekly point; the nightly logical dump gives
    finer daily granularity and single-table restore.

    Uses the credential from backend\.env's DATABASE_URL. That account must have
    the REPLICATION attribute (the default 'postgres' superuser does). No
    pg_hba.conf change is needed for a localhost connection under the default
    'trust'/'scram' local rules; see the runbook for a least-privilege
    backupuser as optional hardening.

.PARAMETER BackupRoot
    Root backup directory. Base backups go to <BackupRoot>\base. Required.

.PARAMETER RetentionWeeks
    Delete base backups older than this many weeks. Default 4.

.PARAMETER PgBin
    PostgreSQL bin directory. Default resolves to the PG 17 install / PATH.

.EXAMPLE
    .\Backup-BaseBackup.ps1 -BackupRoot D:\pg_backups
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupRoot,
    [int]$RetentionWeeks = 4,
    [string]$PgBin
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib.ps1')

try {
    $cfg = Get-DbConfig
    $bin = Resolve-PgBin -PgBin $PgBin
    $pgBaseBackup = Join-Path $bin 'pg_basebackup.exe'

    $baseDir = Join-Path $BackupRoot 'base'
    if (-not (Test-Path -LiteralPath $baseDir)) {
        New-Item -ItemType Directory -Path $baseDir -Force | Out-Null
    }

    $ts   = Get-Date -Format 'yyyyMMdd_HHmmss'
    $dest = Join-Path $baseDir "base_$ts"

    Write-Host "Base backup of cluster on $($cfg.Host):$($cfg.Port) -> $dest" -ForegroundColor Cyan

    Invoke-WithPgPassword -Password $cfg.Password -Body {
        # -Ft tar format, -z gzip, -Xs stream WAL, -P progress. pg_basebackup
        # creates $dest itself and requires it to be empty/nonexistent.
        & $pgBaseBackup `
            -h $cfg.Host -p $cfg.Port -U $cfg.User `
            -D $dest -Ft -z -Xs -P
        if ($LASTEXITCODE -ne 0) {
            throw "pg_basebackup exited with code $LASTEXITCODE"
        }
    }

    # Sanity: the tar-format backup must contain base.tar.gz. -Xs adds
    # pg_wal.tar.gz. Assert base.tar.gz exists and is non-trivial.
    $baseTar = Join-Path $dest 'base.tar.gz'
    if (-not (Test-Path -LiteralPath $baseTar)) {
        throw "Expected $baseTar not found after pg_basebackup."
    }
    if ((Get-Item -LiteralPath $baseTar).Length -lt 1024) {
        throw "base.tar.gz is suspiciously small: $baseTar"
    }

    # Retention: prune old base_* directories.
    $cutoff = (Get-Date).AddDays(-7 * $RetentionWeeks)
    # @() so .Count is valid whether 0, 1, or many match (strict mode).
    $pruned = @(Get-ChildItem -LiteralPath $baseDir -Directory |
        Where-Object { $_.Name -like 'base_*' -and $_.LastWriteTime -lt $cutoff })
    foreach ($p in $pruned) {
        Remove-Item -LiteralPath $p.FullName -Recurse -Force
        Write-Host "  pruned $($p.Name)" -ForegroundColor DarkGray
    }

    $sizeMb = [math]::Round(((Get-ChildItem -LiteralPath $dest -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
    Write-BackupEvent -EventId 100 -EntryType Information `
        -Message "Base backup OK: $dest ($sizeMb MB). Pruned $($pruned.Count) base backup(s) older than $RetentionWeeks week(s)."
    Write-Host "Done." -ForegroundColor Green
    exit 0
}
catch {
    Write-BackupEvent -EventId 200 -EntryType Error `
        -Message "Base backup FAILED: $($_.Exception.Message)"
    exit 1
}
