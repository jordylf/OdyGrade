# Launches a FRESH After Effects 2024 instance to run tools/adobe-host-smoke.jsx.
# Refuses if After Effects is already running, so the script can never be sent to
# a user's open session. Never kills/closes AE; the user closes it afterwards.
param(
  [string]$AfterFX = 'C:\Program Files\Adobe\Adobe After Effects 2024\Support Files\AfterFX.exe',
  [string]$Source = (Join-Path $PSScriptRoot '..\..\..\work\adobe-host\source.png'),
  [int]$TimeoutSec = 600
)
$ErrorActionPreference = 'Stop'
if (Get-Process AfterFX -ErrorAction SilentlyContinue) { throw 'After Effects is already running. Close it yourself first; nothing was launched.' }
if (-not (Test-Path $AfterFX)) { throw "AfterFX.exe not found: $AfterFX" }
if (-not (Test-Path $Source)) { throw "Source still not found: $Source" }

$runs = Join-Path (Split-Path (Resolve-Path $Source)) 'runs'
$dir = Join-Path $runs (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $dir | Out-Null   # fails if it exists: fresh folder only
Copy-Item $Source (Join-Path $dir 'source.png')

$env:ODY_TEST_DIR = $dir
$jsx = Join-Path $PSScriptRoot 'adobe-host-smoke.jsx'
Start-Process -FilePath $AfterFX -ArgumentList @('-r', "`"$jsx`"") | Out-Null

$report = Join-Path $dir 'host-result.json'
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while (-not (Test-Path $report) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 3 }
if (-not (Test-Path $report)) { throw "No host-result.json after $TimeoutSec s in $dir (AE left running for inspection)." }
Get-Content $report -Raw
Get-ChildItem $dir | Select-Object Name, Length
