$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$envFile = Join-Path $PSScriptRoot "aiyo\.env.dev"
$envExample = Join-Path $PSScriptRoot "aiyo\.env.dev.example"
if (-not (Test-Path -LiteralPath $envFile)) {
    if (-not (Test-Path -LiteralPath $envExample)) {
        Write-Error "Missing aiyo/.env.dev and aiyo/.env.dev.example. Create aiyo/.env.dev before starting Compose."
        exit 1
    }
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "Created aiyo/.env.dev from .env.dev.example. Set NEXTAUTH_SECRET and OPENWEBUI_API_KEY before live AI verification." -ForegroundColor Yellow
}

. "$PSScriptRoot\scripts\import-compose-dotenv.ps1"
$null = Import-AiyoComposeDotEnv -Root $PSScriptRoot -Mode dev

$composeEnvArgs = @("--env-file", "./aiyo/.env.dev")
$services = @(
    "aiyo-new-postgres-dev",
    "aiyo-new-redis",
    "open-webui",
    "aiyo-new-app-dev"
)

Write-Host "Starting dev stack via Compose (network: backend; env: aiyo/.env.dev)."
docker compose @composeEnvArgs up -d --build --force-recreate @services

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
docker compose @composeEnvArgs ps

Write-Host ""
Write-Host "App      : http://127.0.0.1:3000"
Write-Host "OpenWebUI: http://127.0.0.1:8080"
Write-Host "Health   : curl http://127.0.0.1:3000/api/health"
