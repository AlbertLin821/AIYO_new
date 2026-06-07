$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot "aiyo\.env"
$envExample = Join-Path $PSScriptRoot "aiyo\.env.example"
if (-not (Test-Path -LiteralPath $envFile)) {
    if (-not (Test-Path -LiteralPath $envExample)) {
        Write-Error "Missing aiyo/.env and aiyo/.env.example. Create aiyo/.env before starting Compose."
        exit 1
    }
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "Created aiyo/.env from .env.example. Set NEXTAUTH_SECRET and OAuth secrets before production use." -ForegroundColor Yellow
}

& "$PSScriptRoot\scripts\clone-mem0.ps1"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

. "$PSScriptRoot\scripts\import-compose-dotenv.ps1"
$null = Import-AiyoComposeDotEnv -Root $PSScriptRoot

$composeEnvArgs = @("--env-file", "./aiyo/.env")
$envLocal = Join-Path $PSScriptRoot "aiyo\.env.local"
if (Test-Path -LiteralPath $envLocal) {
    $composeEnvArgs += @("--env-file", "./aiyo/.env.local")
}
Write-Host "Starting postgres, redis, mem0, and app-dev via Compose (network: backend; env: aiyo/.env + .env.local if present)."
docker compose @composeEnvArgs --profile dev --profile mem0 up -d --force-recreate postgres redis mem0-memory-postgres mem0-memory app-dev

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
docker compose @composeEnvArgs --profile dev --profile mem0 ps

Write-Host ""
Write-Host "If you previously saw Prisma error P1001, run:"
Write-Host "  docker compose --env-file ./aiyo/.env [--env-file ./aiyo/.env.local] --profile dev --profile mem0 up -d --force-recreate app-dev"
Write-Host "Avoid using only: docker start aiyo-new-app-dev"
