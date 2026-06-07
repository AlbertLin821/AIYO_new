param(
    [int] $Port = 3015,
    [string] $DatabaseUrl = "postgresql://aiyo:aiyo_password_change_me@127.0.0.1:5432/aiyo_new_dev_db?schema=public",
    [string] $RedisUrl = "redis://127.0.0.1:6379/0",
    [string] $OpenWebUiBaseUrl = "http://127.0.0.1:8080",
    [string] $NextAuthSecret = "",
    [string] $EnvFile = ".env.dev",
    [string] $EnvMode = "dev"
)

$ErrorActionPreference = "Stop"

$baseUrl = "http://127.0.0.1:$Port"
$env:AIYO_ENV_FILE = $EnvFile
$env:AIYO_ENV_MODE = $EnvMode
$env:DATABASE_URL = $DatabaseUrl
$env:REDIS_URL = $RedisUrl
$env:OPENWEBUI_BASE_URL = $OpenWebUiBaseUrl
$env:NEXTAUTH_URL = $baseUrl
$env:PORT = "$Port"
if ($NextAuthSecret) {
    $env:NEXTAUTH_SECRET = $NextAuthSecret
}

Write-Host "Starting E2E server at $baseUrl"
Write-Host "AIYO_ENV_FILE    : $EnvFile"
Write-Host "AIYO_ENV_MODE    : $EnvMode"
Write-Host "DATABASE_URL     : $DatabaseUrl"
Write-Host "REDIS_URL        : $RedisUrl"
Write-Host "OPENWEBUI        : $OpenWebUiBaseUrl"

npx next start -H 127.0.0.1 -p $Port
