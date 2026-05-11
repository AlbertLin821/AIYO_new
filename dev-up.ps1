$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

& "$PSScriptRoot\scripts\clone-mem0.ps1"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "Starting postgres, redis, searxng, mem0, and app-dev via Compose (project network: backend)."
docker compose --profile dev --profile mem0 up -d postgres redis searxng mem0-memory-postgres mem0-memory app-dev

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
docker compose --profile dev ps

Write-Host ""
Write-Host "If you previously saw Prisma error P1001, run:"
Write-Host "  docker compose --profile dev --profile mem0 up -d --force-recreate app-dev"
Write-Host "Avoid using only: docker start aiyo-new-app-dev"
