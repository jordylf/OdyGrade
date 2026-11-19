# Premiere 2024 host smoke. Refuses if Premiere is running (so no user project can be open),
# installs the dev-only runner extension, writes a one-shot job, launches Premiere, waits.
# -Remove uninstalls the runner extension afterwards.
param([switch]$Remove, [int]$TimeoutSec = 300)
$ErrorActionPreference = 'Stop'
$ext = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.odyworks.odygrade.smoke'
if ($Remove) { if (Test-Path $ext) { Remove-Item -LiteralPath $ext -Recurse -Force }; 'runner removed'; exit 0 }
if (Get-Process 'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { throw 'Premiere is running; close it first. Nothing started.' }
$repo = Split-Path $PSScriptRoot
$run = Join-Path $repo "..\..\work\adobe-host\runs\ppro-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $run | Out-Null
$run = (Resolve-Path $run).Path
Copy-Item (Join-Path $repo '..\..\work\adobe-host\source.png') $run
if (Test-Path $ext) { Remove-Item -LiteralPath $ext -Recurse -Force }
Copy-Item (Join-Path $PSScriptRoot 'ppro-smoke-runner') $ext -Recurse
Set-Content -LiteralPath (Join-Path $env:TEMP 'odygrade-ppro-job.txt') -Value $run -Encoding ascii -NoNewline
Start-Process 'C:\Program Files\Adobe\Adobe Premiere Pro 2024\Adobe Premiere Pro.exe'
$result = Join-Path $run 'phase1.json'  # phase 2: close the scratch project, write "reopen $run" to the job file
for ($t = 0; $t -lt $TimeoutSec -and -not (Test-Path $result); $t += 2) { Start-Sleep 2 }
"run: $run"
if (Test-Path $result) { Get-Content $result -Raw } else { 'no result yet (Premiere may show a dialog)' }
