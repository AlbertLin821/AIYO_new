$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Starting postgres, redis, app-dev via Compose (project network: backend)."
docker compose --profile dev up -d postgres redis app-dev

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
docker compose --profile dev ps

Write-Host ""
Write-Host "If you previously saw Prisma error P1001, run:"
Write-Host "  docker compose --profile dev up -d --force-recreate app-dev"
Write-Host "Avoid using only: docker start aiyo-new-app-dev"
