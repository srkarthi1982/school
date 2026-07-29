<#
.SYNOPSIS
    Nightly logical backup of the JAI-School PostgreSQL database (pg_dump -Fc).

.DESCRIPTION
    Takes a compressed custom-format dump of the database named in
    backend\.env's DATABASE_URL, writes it to <BackupRoot>\logical, verifies it
    is non-empty, prunes dumps older than -RetentionDays, and logs the outcome
    to the Application event log (source JAI-School-Backup).

    Custom format (-Fc) is portable across machines and supports selective
    restore of a single table (pg_restore -t), which the physical base backup
    cannot do.

.PARAMETER BackupRoot
    Root backup directory. Dumps go to <BackupRoot>\logical. Required.

.PARAMETER RetentionDays
    Delete dumps older than this many days. Default 14.

.PARAMETER Encrypt
    If set, encrypt each dump at rest with 7-Zip (AES-256, header encryption)
    and remove the plaintext. Requires 7z.exe (-SevenZip) and a passphrase in
    the BACKUP_7Z_PASSWORD environment variable. Off by default.

.PARAMETER SevenZip
    Path to 7z.exe. Default '7z' (expects it on PATH). Only used with -Encrypt.

.PARAMETER PgBin
    PostgreSQL bin directory. Default resolves to the PG 17 install / PATH.

.EXAMPLE
    .\Backup-Database.ps1 -BackupRoot D:\pg_backups
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupRoot,
    [int]$RetentionDays = 14,
    [switch]$Encrypt,
    [string]$SevenZip = '7z',
    [string]$PgBin
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib.ps1')

try {
    $cfg   = Get-DbConfig
    $bin   = Resolve-PgBin -PgBin $PgBin
    $pgDump = Join-Path $bin 'pg_dump.exe'

    $outDir = Join-Path $BackupRoot 'logical'
    if (-not (Test-Path -LiteralPath $outDir)) {
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }

    $ts   = Get-Date -Format 'yyyyMMdd_HHmmss'
    $file = Join-Path $outDir ("{0}_{1}.dump" -f $cfg.Database, $ts)

    Write-Host "Dumping database '$($cfg.Database)' -> $file" -ForegroundColor Cyan

    Invoke-WithPgPassword -Password $cfg.Password -Body {
        & $pgDump `
            -h $cfg.Host -p $cfg.Port -U $cfg.User `
            -Fc -d $cfg.Database -f $file
        if ($LASTEXITCODE -ne 0) {
            throw "pg_dump exited with code $LASTEXITCODE"
        }
    }

    # A pg_dump can exit 0 yet leave a truncated file if the disk fills; assert
    # the artifact actually exists and is non-trivial in size.
    $info = Get-Item -LiteralPath $file
    if ($info.Length -lt 1024) {
        throw "Dump file is suspiciously small ($($info.Length) bytes): $file"
    }

    $finalFile = $file
    if ($Encrypt) {
        if (-not $env:BACKUP_7Z_PASSWORD) {
            throw "-Encrypt set but BACKUP_7Z_PASSWORD environment variable is empty."
        }
        $archive = "$file.7z"
        Write-Host "Encrypting -> $archive" -ForegroundColor Cyan
        # -mhe=on encrypts the archive header (file names) too; -p<pass> without
        # a space. Password is read from env so it is not on the command line
        # we build, though 7z still receives it as an argument.
        & $SevenZip a -t7z "-p$($env:BACKUP_7Z_PASSWORD)" -mhe=on $archive $file | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "7-Zip encryption failed (exit $LASTEXITCODE)"
        }
        Remove-Item -LiteralPath $file -Force
        $finalFile = $archive
    }

    # Retention: prune old dumps AND their .7z variants.
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    # @() so .Count is valid whether 0, 1, or many match (strict mode).
    $pruned = @(Get-ChildItem -LiteralPath $outDir -File |
        Where-Object { $_.Name -like "$($cfg.Database)_*" -and $_.LastWriteTime -lt $cutoff })
    foreach ($p in $pruned) {
        Remove-Item -LiteralPath $p.FullName -Force
        Write-Host "  pruned $($p.Name)" -ForegroundColor DarkGray
    }

    $sizeMb = [math]::Round((Get-Item -LiteralPath $finalFile).Length / 1MB, 1)
    Write-BackupEvent -EventId 100 -EntryType Information `
        -Message "Logical dump OK: $finalFile ($sizeMb MB). Pruned $($pruned.Count) old dump(s) older than $RetentionDays days."
    Write-Host "Done." -ForegroundColor Green
    exit 0
}
catch {
    Write-BackupEvent -EventId 200 -EntryType Error `
        -Message "Logical dump FAILED: $($_.Exception.Message)"
    exit 1
}
