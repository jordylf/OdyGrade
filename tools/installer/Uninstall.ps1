# Removes the OdyGrade panel (current user) and effect (UAC). Projects using the effect keep their settings.
$ErrorActionPreference = 'Stop'
if (Get-Process AfterFX,'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { throw 'Close After Effects and Premiere Pro first. Nothing was removed.' }
$panel = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.odyworks.odygrade'
if (Test-Path -LiteralPath $panel) { Remove-Item -LiteralPath $panel -Recurse -Force; 'Panel removed.' } else { 'Panel not installed.' }
$aex = Join-Path $env:ProgramFiles 'Adobe\Common\Plug-ins\7.0\MediaCore\OdyWorks\OdyGrade.aex'
if (Test-Path -LiteralPath $aex) {
  Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -Command Remove-Item -LiteralPath '$aex' -Force"
  if (Test-Path -LiteralPath $aex) { throw 'Effect NOT removed (UAC declined?).' } else { 'Effect removed.' }
} else { 'Effect not installed.' }
'PlayerDebugMode was left as is (other unsigned panels may need it).'
