$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "vendor\mem0"
$marker = Join-Path $target "server\dev.Dockerfile"

if (Test-Path $marker) {
    Write-Host "Mem0 repo already present at vendor/mem0"
    exit 0
}

Write-Host "Cloning mem0ai/mem0 into vendor/mem0 (shallow, ~once per machine)..."
New-Item -ItemType Directory -Force -Path (Join-Path $root "vendor") | Out-Null
git clone --depth 1 https://github.com/mem0ai/mem0.git $target
if ($LASTEXITCODE -ne 0) {
    Write-Error "git clone failed. Install Git and retry, or clone manually to vendor/mem0"
    exit $LASTEXITCODE
}
Write-Host "Done: $target"
