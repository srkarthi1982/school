<#
.SYNOPSIS
    Reliably stop the server listening on a port.

.DESCRIPTION
    Finds every process listening on the port, walks UP the parent chain
    through known server/wrapper processes (python.exe, uvicorn.exe, uv.exe)
    and kills the topmost one with its whole process tree (taskkill /T /F).

    This works no matter how the server was started:
      - python -m uvicorn ...
      - uvicorn ...           (console-script shim parents a python.exe)
      - uv run uvicorn ...    (uv.exe parents the shim/python)
      - uvicorn --reload      (reloader parent respawns workers unless the
                               whole tree is killed from the top)

    The climb stops at anything that is not a known server process
    (cmd.exe, powershell.exe, explorer.exe, ...) so the caller's shell is
    never killed. After killing, the port is re-scanned until it is
    actually free.

.PARAMETER Port
    TCP port the server listens on. Default: 8000.

.PARAMETER TimeoutSeconds
    How long to keep retrying before giving up. Default: 15.
#>
[CmdletBinding()]
param(
    [int]$Port = 8000,
    [int]$TimeoutSeconds = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# Process names we are allowed to climb to and kill. The parent walk stops at
# anything else, so the shell that invoked this script is never touched.
$serverNames = @('python.exe', 'uvicorn.exe', 'uv.exe', 'uvx.exe')

function Get-ListenerPids {
    param([int]$Port)
    $found = @()
    try {
        $found = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {
        # Fallback when Get-NetTCPConnection is unavailable. Anchored regex so
        # :8000 does not match :18000, and only LISTENING lines count.
        foreach ($line in (& netstat -ano -p TCP)) {
            if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
                if ([int]$Matches[1] -eq $Port) { $found += [int]$Matches[2] }
            }
        }
        $found = @($found | Select-Object -Unique)
    }
    # PID 0 (Idle) and 4 (System) are never our server.
    return @($found | Where-Object { $_ -gt 4 })
}

function Get-KillRoot {
    param([int]$ListenerPid)
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $ListenerPid" -ErrorAction SilentlyContinue
    if (-not $current) { return $ListenerPid }
    while ($true) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($current.ParentProcessId)" -ErrorAction SilentlyContinue
        if (-not $parent) { break }
        if ($serverNames -notcontains $parent.Name) { break }
        # PID-reuse guard: a real parent always started before its child.
        if ($parent.CreationDate -and $current.CreationDate -and $parent.CreationDate -gt $current.CreationDate) { break }
        $current = $parent
    }
    return [int]$current.ProcessId
}

Write-Host "Looking for processes listening on :$Port ..."

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$portFree = $false
$killedAny = $false

while ($true) {
    $listeners = @(Get-ListenerPids -Port $Port)
    if ($listeners.Count -eq 0) {
        $portFree = $true
        break
    }

    $roots = @($listeners | ForEach-Object { Get-KillRoot -ListenerPid $_ } | Select-Object -Unique)
    foreach ($root in $roots) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $root" -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.Name } else { 'pid' }
        Write-Host "  taskkill /PID $root /T /F  ($name owns :$Port)"
        taskkill /PID $root /T /F 2>&1 | ForEach-Object { Write-Host "    $_" }
        $killedAny = $true
    }

    if ((Get-Date) -gt $deadline) { break }
    Start-Sleep -Milliseconds 500
}

if (-not $portFree) {
    # Deadline hit right after a kill; check one last time.
    $portFree = @(Get-ListenerPids -Port $Port).Count -eq 0
}

if ($portFree) {
    if ($killedAny) {
        Write-Host "Server stopped. Port :$Port is free." -ForegroundColor Green
    } else {
        Write-Host "No process was listening on :$Port." -ForegroundColor DarkGray
    }
    exit 0
} else {
    Write-Warning "Port :$Port is still in use after ${TimeoutSeconds}s."
    exit 1
}
