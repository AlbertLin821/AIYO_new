param(
    [switch] $WithMem0
)

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

$devRunning = docker ps --filter "name=aiyo-new-app-dev" --filter "status=running" --format "{{.Names}}" 2>$null
if ($devRunning -match "aiyo-new-app-dev") {
    Write-Host "app-dev (aiyo-new-app-dev) is still running and also uses port 3000." -ForegroundColor Yellow
    Write-Host "Stop it first, for example:" -ForegroundColor Yellow
    Write-Host "  docker compose --env-file ./aiyo/.env --profile dev down" -ForegroundColor Yellow
    exit 1
}

$composeArgs = @(
    "compose",
    "--env-file", "./aiyo/.env",
    "--profile", "prod-live"
)
if ($WithMem0) {
    & "$PSScriptRoot\scripts\clone-mem0.ps1"
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    $composeArgs += "--profile", "mem0"
}

Write-Host "Starting postgres, redis, and app-prod-live (build + next start on each container start)."
Write-Host "Pull latest code on the host yourself before re-running if needed."

$upArgs = $composeArgs + @(
    "up", "-d", "--build",
    "postgres", "redis", "app-prod-live"
)
if ($WithMem0) {
    $upArgs += "mem0-memory-postgres", "mem0-memory"
}

& docker @upArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
& docker @($composeArgs + @("ps"))

Write-Host ""
Write-Host "App: http://localhost:3000  (health: curl http://localhost:3000/api/health)"
Write-Host "First start runs npm run build inside the container; allow several minutes."
Write-Host "After code changes, re-run .\prod-live-up.ps1 or:"
Write-Host "  docker compose --env-file ./aiyo/.env --profile prod-live up -d --force-recreate app-prod-live"
Write-Host "Switching from dev mode? Consider removing ./aiyo/.next if you see stale assets."
