$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot "aiyo\.env.prod-live"
$envExample = Join-Path $PSScriptRoot "aiyo\.env.prod-live.example"
if (-not (Test-Path -LiteralPath $envFile)) {
    if (-not (Test-Path -LiteralPath $envExample)) {
        Write-Error "Missing aiyo/.env.prod-live and aiyo/.env.prod-live.example. Create aiyo/.env.prod-live before starting Compose."
        exit 1
    }
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "Created aiyo/.env.prod-live from .env.prod-live.example. Set NEXTAUTH_SECRET and OPENWEBUI_API_KEY before live AI verification." -ForegroundColor Yellow
}

. "$PSScriptRoot\scripts\import-compose-dotenv.ps1"
$null = Import-AiyoComposeDotEnv -Root $PSScriptRoot -Mode "prod-live"

$composeEnvArgs = @("--env-file", "./aiyo/.env.prod-live")
$services = @(
    "aiyo-new-postgres",
    "aiyo-new-mem0-postgres",
    "aiyo-new-redis",
    "aiyo-new-mem0",
    "open-webui",
    "aiyo-new-app-prod-live"
)

Write-Host "Starting prod-live stack via Compose (env: aiyo/.env.prod-live)."
docker compose @composeEnvArgs up -d --build --force-recreate @services

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
docker compose @composeEnvArgs ps

Write-Host ""
Write-Host "Prod-live app: http://127.0.0.1:3001"
Write-Host "OpenWebUI    : http://127.0.0.1:8080"
Write-Host "Health       : curl http://127.0.0.1:3001/api/health"
