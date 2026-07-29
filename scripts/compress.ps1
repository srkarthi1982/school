<#
.SYNOPSIS
  Compress the jai-school project into a .7z archive.

.DESCRIPTION
  Creates a max-efficiency 7-Zip archive of the project root. By default
  backend\.venv and frontend\node_modules are excluded, but either can be
  included with -IncludeVenv and -IncludeNodeModules respectively. The
  archive is written to the project root with a timestamped filename.

.PARAMETER CompressionLevel
  Friendly compression level. Accepted values:
    store  - no compression (fastest, largest output)
    fast   - fastest compression
    normal - balanced (default)
    max    - high compression
    ultra  - maximum compression (slowest, smallest output)

.PARAMETER IncludeVenv
  Include backend\.venv in the archive (excluded by default).

.PARAMETER IncludeNodeModules
  Include frontend\node_modules in the archive (excluded by default).

.PARAMETER Password
  Encrypt the archive with the given password (also encrypts the file
  headers/names via 7-Zip -mhe=on). If omitted, the archive is not encrypted.

.PARAMETER Help
  Show this help message.

.EXAMPLE
  .\compress.ps1
  Compress using the default 'normal' level.

.EXAMPLE
  .\compress.ps1 -cl ultra
  Compress using maximum compression.

.EXAMPLE
  .\compress.ps1 -IncludeVenv
  Compress including backend\.venv.

.EXAMPLE
  .\compress.ps1 -IncludeNodeModules
  Compress including frontend\node_modules.

.EXAMPLE
  .\compress.ps1 -IncludeVenv -IncludeNodeModules
  Compress including both backend\.venv and frontend\node_modules.

.EXAMPLE
  .\compress.ps1 -p p4ssw0rd
  Compress and encrypt the archive with the password 'p4ssw0rd'.

.EXAMPLE
  .\compress.ps1 -Help
  Show help.
#>
[CmdletBinding()]
param(
  [switch]$Help,
  [Alias('cl')]
  [ValidateSet('store', 'fast', 'normal', 'max', 'ultra')]
  [string]$CompressionLevel = 'ultra',
  [Alias('venv')]
  [switch]$IncludeVenv,
  [Alias('nm')]
  [switch]$IncludeNodeModules,
  [Alias('p')]
  [string]$Password
)

if ($Help) {
  Get-Help $PSCommandPath -Detailed
  exit 0
}

$ErrorActionPreference = 'Stop'

# Friendly name -> 7z -mx value
$mxMap = @{
  store  = '0'
  fast   = '1'
  normal = '5'
  max    = '7'
  ultra  = '9'
}
$mx = $mxMap[$CompressionLevel]

# Root of the project is the parent of this scripts folder
$root = Split-Path $PSScriptRoot -Parent

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out   = Join-Path $root "jai-school_$stamp.7z"

if (Test-Path $out) { Remove-Item $out -Force }

# Solid archive only benefits higher levels
$solid = if ($CompressionLevel -in 'max','ultra') { 'on' } else { 'off' }

# Build exclusion arguments
$excludes = @()
if (-not $IncludeVenv)        { $excludes += '-xr!backend\.venv' }
if (-not $IncludeNodeModules) { $excludes += '-xr!frontend\node_modules' }

# Build encryption arguments (also encrypts file names via -mhe=on)
$encryption = @()
if ($Password) { $encryption += "-p$Password"; $encryption += '-mhe=on' }

Push-Location $root
try {
  7z a -t7z `
    "-mx=$mx" "-ms=$solid" `
    -mfb=273 -md=1024m -m0=lzma2 `
    @excludes `
    @encryption `
    "$out" "*"
}
finally { Pop-Location }