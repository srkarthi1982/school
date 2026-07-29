<#
.SYNOPSIS
    One-time setup for JAI-School PostgreSQL backups: register the Event Log
    source, create backup directories, and register the three Scheduled Tasks.

.DESCRIPTION
    Run once (and again after changing paths - it is idempotent) from an
    ELEVATED PowerShell. Registers:

      | Task name                          | Schedule        | Script                  |
      |------------------------------------|-----------------|-------------------------|
      | JAI-School Nightly DB Dump         | Daily 02:00     | Backup-Database.ps1     |
      | JAI-School Weekly Base Backup      | Sunday 01:30    | Backup-BaseBackup.ps1   |
      | JAI-School Backup Health Check     | Daily 07:30     | Test-BackupHealth.ps1   |

    Each task runs whether the user is logged on or not, with highest
    privileges, as -RunAsUser (default SYSTEM). Mirrors deploy.ps1's idempotent
    "delete then (re)create" approach so a path change self-heals on re-run.

.PARAMETER BackupRoot
    Root backup directory. Creates <BackupRoot>\logical and <BackupRoot>\base.
    Required.

.PARAMETER RunAsUser
    Account the tasks run as. Default 'SYSTEM'. For a domain service account
    that also needs a network share, pass e.g. 'DOMAIN\svc-backup' with
    -RunAsPassword.

.PARAMETER RunAsPassword
    Password for -RunAsUser (only for a non-SYSTEM account).

.PARAMETER RetentionDays
    Passed to the nightly dump task. Default 14.

.PARAMETER RetentionWeeks
    Passed to the weekly base backup task. Default 4.

.PARAMETER PgBin
    PostgreSQL bin directory passed to the backup tasks. Optional (auto-resolved
    if omitted).

.EXAMPLE
    # From an elevated prompt:
    .\Install-BackupTasks.ps1 -BackupRoot D:\pg_backups
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupRoot,
    [string]$RunAsUser = 'SYSTEM',
    [string]$RunAsPassword,
    [int]$RetentionDays = 14,
    [int]$RetentionWeeks = 4,
    [string]$PgBin
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib.ps1')

function Write-Banner {
    param([string]$Text)
    Write-Host ''
    Write-Host ('=' * 70) -ForegroundColor Cyan
    Write-Host (' ' + $Text) -ForegroundColor Cyan
    Write-Host ('=' * 70) -ForegroundColor Cyan
}

# Must be elevated: registering an event source and a "run whether logged on or
# not" task both require admin.
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Run this from an elevated (Administrator) PowerShell."
}

# ---------------------------------------------------------------------------
Write-Banner 'Step 1/4  Event Log source'

if ([System.Diagnostics.EventLog]::SourceExists('JAI-School-Backup')) {
    Write-Host "Event source 'JAI-School-Backup' already registered."
} else {
    New-EventLog -LogName Application -Source 'JAI-School-Backup'
    Write-Host "Registered event source 'JAI-School-Backup' in the Application log."
}

# ---------------------------------------------------------------------------
Write-Banner 'Step 2/4  Backup directories'

foreach ($sub in @('logical', 'base')) {
    $d = Join-Path $BackupRoot $sub
    if (-not (Test-Path -LiteralPath $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "Created $d"
    } else {
        Write-Host "Exists   $d"
    }
}

# ---------------------------------------------------------------------------
Write-Banner 'Step 3/4  Scheduled tasks'

$pwsh = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Register-BackupTask {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$ScriptFile,
        [Parameter(Mandatory)][string]$ExtraArgs,
        [Parameter(Mandatory)]$Trigger
    )

    $scriptPath = Join-Path $PSScriptRoot $ScriptFile
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Backup script not found: $scriptPath"
    }

    $argLine = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -BackupRoot `"$BackupRoot`" $ExtraArgs"
    $action  = New-ScheduledTaskAction -Execute $pwsh -Argument $argLine

    if ($RunAsUser -eq 'SYSTEM') {
        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    } else {
        $principal = New-ScheduledTaskPrincipal -UserId $RunAsUser -LogonType Password -RunLevel Highest
    }

    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
        -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Hours 6)

    # Idempotent: remove any existing task with this name first.
    if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false
    }

    $task = New-ScheduledTask -Action $action -Trigger $Trigger -Principal $principal -Settings $settings

    if ($RunAsUser -eq 'SYSTEM') {
        Register-ScheduledTask -TaskName $Name -InputObject $task | Out-Null
    } else {
        if (-not $RunAsPassword) {
            throw "RunAsUser '$RunAsUser' requires -RunAsPassword."
        }
        Register-ScheduledTask -TaskName $Name -InputObject $task `
            -User $RunAsUser -Password $RunAsPassword | Out-Null
    }
    Write-Host "  registered: $Name"
}

$pgBinArg = if ($PgBin) { "-PgBin `"$PgBin`"" } else { '' }

Register-BackupTask -Name 'JAI-School Nightly DB Dump' `
    -ScriptFile 'Backup-Database.ps1' `
    -ExtraArgs "-RetentionDays $RetentionDays $pgBinArg" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At '02:00')

Register-BackupTask -Name 'JAI-School Weekly Base Backup' `
    -ScriptFile 'Backup-BaseBackup.ps1' `
    -ExtraArgs "-RetentionWeeks $RetentionWeeks $pgBinArg" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '01:30')

Register-BackupTask -Name 'JAI-School Backup Health Check' `
    -ScriptFile 'Test-BackupHealth.ps1' `
    -ExtraArgs '' `
    -Trigger (New-ScheduledTaskTrigger -Daily -At '07:30')

# ---------------------------------------------------------------------------
Write-Banner 'Step 4/4  Summary'

Write-Host ''
Write-Host 'Backup tasks installed.' -ForegroundColor Green
Write-Host ''
Write-Host "  Backup root:  $BackupRoot"
Write-Host "  Runs as:      $RunAsUser"
Write-Host "  Retention:    dumps $RetentionDays days, base backups $RetentionWeeks weeks"
Write-Host ''
Write-Host 'Verify / operate:'
Write-Host '  Get-ScheduledTask -TaskName "JAI-School*"'
Write-Host '  Start-ScheduledTask -TaskName "JAI-School Nightly DB Dump"   # run now'
Write-Host '  Get-WinEvent -LogName Application -FilterXPath "*[System/Provider/@Name=''JAI-School-Backup'']" -MaxEvents 20'
Write-Host ''
Write-Host 'Next: run a restore drill (see docs/postgresql-backup-runbook-airgapped-windows.md).' -ForegroundColor Yellow
