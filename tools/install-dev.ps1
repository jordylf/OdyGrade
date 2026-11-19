param([switch]$EnableDebug)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\release\OdyGrade-CEP'))
$destination = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.odyworks.odygrade'
if (-not (Test-Path -LiteralPath (Join-Path $source 'CSXS\manifest.xml'))) { throw 'Run npm run package first.' }
if (Test-Path -LiteralPath $destination) { throw "Already installed at $destination. Back up the existing installation before replacing it." }
New-Item -ItemType Directory -Path $destination | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'index.html'),(Join-Path $source 'README.md'),(Join-Path $source 'THIRD_PARTY_NOTICES.md') -Destination $destination
foreach ($folder in @('src','host','CSXS','assets')) { Copy-Item -LiteralPath (Join-Path $source $folder) -Destination $destination -Recurse }
if ($EnableDebug) {
  $registryPath = 'HKCU:\Software\Adobe\CSXS.11'
  New-Item -Path $registryPath -Force | Out-Null
  New-ItemProperty -Path $registryPath -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
}
Write-Output "Installed development panel at $destination. Restart Adobe 2024, then Window > Extensions > OdyGrade."
Write-Output 'Unsigned development build; not verified as a clean-machine production installation.'
