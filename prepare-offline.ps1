$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$electron = Join-Path $PSScriptRoot 'node_modules\.bin\electron.cmd'
if (-not (Test-Path -LiteralPath $electron)) {
    Write-Host 'Installing the isolated runtime (one time only)...' -ForegroundColor Cyan
    $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
    & npm install
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}

Write-Host 'Starting online preparation mode.' -ForegroundColor Cyan
Write-Host 'Wait for the full TETR.IO menu and the green completion banner before closing the game window.'
Write-Host 'Visit each local game page you plan to use so any on-demand resources are archived.'
& $electron . --prepare
if ($LASTEXITCODE -ne 0) { throw "Preparation process exited with code $LASTEXITCODE." }

Write-Host 'Prefetching backgrounds, skins, fonts and icons...' -ForegroundColor Cyan
& node .\scripts\prefetch-core.js
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'Some optional resources failed. See offline-data\archive\prefetch-report.json and rerun later.'
}
