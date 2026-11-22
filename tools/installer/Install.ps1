# OdyGrade installer (Windows, After Effects / Premiere Pro 2024).
# Panel: per-user CEP extension. Effect: Adobe MediaCore plug-in (needs one UAC prompt).
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
if (Get-Process AfterFX,'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { throw 'Close After Effects and Premiere Pro first. Nothing was installed.' }
$manifest = Get-Content -LiteralPath (Join-Path $here 'plugin\manifest.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath (Join-Path $here 'plugin\OdyGrade.aex') -Algorithm SHA256).Hash -ne $manifest.sha256) { throw 'Package is damaged (plug-in checksum). Nothing was installed.' }
# 1. Panel (current user). An existing copy is moved to a backup outside the extensions folder.
$panel = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.odyworks.odygrade'
if (Test-Path -LiteralPath $panel) {
  $backup = Join-Path $env:LOCALAPPDATA ("OdyGrade\backup\panel-" + (Get-Date -Format yyyyMMdd-HHmmss))
  New-Item -ItemType Directory -Force -Path (Split-Path $backup) | Out-Null
  Move-Item -LiteralPath $panel -Destination $backup
  "Previous panel moved to $backup"
}
Copy-Item -LiteralPath (Join-Path $here 'panel\com.odyworks.odygrade') -Destination $panel -Recurse
# Unsigned panel: CEP 11 (Adobe 2024) loads it only with PlayerDebugMode.
New-Item -Path 'HKCU:\Software\Adobe\CSXS.11' -Force | Out-Null
New-ItemProperty -Path 'HKCU:\Software\Adobe\CSXS.11' -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
# 2. Effect (administrator).
$report = Join-Path $env:TEMP 'OdyGrade-install-result.json'
Remove-Item -LiteralPath $report -ErrorAction SilentlyContinue
Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$here\plugin\InstallPlugin.ps1`" -ReplaceExisting -ReportPath `"$report`""
$result = if (Test-Path $report) { Get-Content $report -Raw | ConvertFrom-Json } else { $null }
if (-not $result -or -not $result.ok) { throw "Panel installed, effect NOT installed: $(if($result){$result.error}else{'UAC was declined or the installer did not run'})" }
"OdyGrade $($manifest.version) installed. Start After Effects or Premiere Pro: Window > Extensions > OdyGrade; effect: Video Effects > OdyWorks > OdyGrade."
