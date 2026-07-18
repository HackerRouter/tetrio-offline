$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$electron = Join-Path $PSScriptRoot 'node_modules\.bin\electron.cmd'
$ready = Join-Path $PSScriptRoot 'offline-data\archive\READY.json'
if (-not (Test-Path -LiteralPath $electron)) {
    throw 'Runtime not installed. Run the online preparation launcher first.'
}
if (-not (Test-Path -LiteralPath $ready)) {
    throw 'Offline resources are not ready. Run the online preparation launcher and wait for completion.'
}

Write-Host 'Starting in enforced offline mode. No Internet resources will be requested.' -ForegroundColor Green
& $electron . --offline
if ($LASTEXITCODE -ne 0) { throw "Offline process exited with code $LASTEXITCODE." }
