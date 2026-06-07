$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Ensure-AiyoEnvFile {
    param(
        [Parameter(Mandatory = $true)][string] $Mode
    )

    $envFile = Join-Path $PSScriptRoot "aiyo\.env.$Mode"
    $envExample = Join-Path $PSScriptRoot "aiyo\.env.$Mode.example"
    if (-not (Test-Path -LiteralPath $envFile)) {
        if (-not (Test-Path -LiteralPath $envExample)) {
            Write-Error "Missing aiyo/.env.$Mode and aiyo/.env.$Mode.example. Create aiyo/.env.$Mode before starting Compose."
            exit 1
        }
        Copy-Item -LiteralPath $envExample -Destination $envFile
        Write-Host "Created aiyo/.env.$Mode from .env.$Mode.example." -ForegroundColor Yellow
    }
}

Ensure-AiyoEnvFile -Mode "dev"
Ensure-AiyoEnvFile -Mode "prod-live"

. "$PSScriptRoot\scripts\import-compose-dotenv.ps1"

Write-Host "Recreating aiyo-new-app-dev using aiyo/.env.dev."
$null = Import-AiyoComposeDotEnv -Root $PSScriptRoot -Mode "dev"
$devComposeEnvArgs = @("--env-file", "./aiyo/.env.dev")
docker compose @devComposeEnvArgs up -d --build --force-recreate "aiyo-new-app-dev"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Recreating aiyo-new-app-prod-live using aiyo/.env.prod-live."
$null = Import-AiyoComposeDotEnv -Root $PSScriptRoot -Mode "prod-live"
$prodComposeEnvArgs = @("--env-file", "./aiyo/.env.prod-live")
docker compose @prodComposeEnvArgs up -d --build --force-recreate "aiyo-new-app-prod-live"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
docker compose @devComposeEnvArgs ps

Write-Host ""
Write-Host "Dev app      : http://127.0.0.1:3000"
Write-Host "Prod-live app: http://127.0.0.1:3001"
