param([string]$ReportPath = (Join-Path $PSScriptRoot 'install-result.json'), [switch]$ReplaceExisting)
$ErrorActionPreference = 'Stop'
try {
 $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
 if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this installer as Administrator; MediaCore is protected by Windows.' }
 $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
 $source = Join-Path $PSScriptRoot 'OdyGrade.aex'
 $digest = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
 if ($digest -ne $manifest.sha256) { throw 'Plugin digest differs from the packaged build. Nothing installed.' }
 $targetFolder = Join-Path $env:ProgramFiles 'Adobe/Common/Plug-ins/7.0/MediaCore/OdyWorks'
 $target = Join-Path $targetFolder 'OdyGrade.aex'
 if (Test-Path -LiteralPath $target) {
  $old = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  if ($old -ne $digest) {
   if (-not $ReplaceExisting) { throw 'A different OdyGrade.aex already exists. It was preserved (use -ReplaceExisting).' }
   if (Get-Process AfterFX,'Adobe Premiere Pro' -ErrorAction SilentlyContinue) { throw 'Close After Effects and Premiere first. Nothing replaced.' }
   Copy-Item -LiteralPath $target -Destination (Join-Path $PSScriptRoot "OdyGrade.replaced-$($old.Substring(0,12)).aex") -ErrorAction Stop
   Copy-Item -LiteralPath $source -Destination $target -Force -ErrorAction Stop
  }
 } else {
  New-Item -ItemType Directory -Force -Path $targetFolder | Out-Null
  Copy-Item -LiteralPath $source -Destination $target -ErrorAction Stop
 }
 if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $digest) { throw 'Installed plugin verification failed.' }
 @{ok=$true; target=$target; sha256=$digest; note='Restart Adobe hosts to scan the effect. Installation is not render validation.'} | ConvertTo-Json | Set-Content -LiteralPath $ReportPath -Encoding UTF8
 exit 0
} catch {
 @{ok=$false; error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $ReportPath -Encoding UTF8
 exit 1
}
