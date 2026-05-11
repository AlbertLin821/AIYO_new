#Requires -Version 5.1
# Dev mode: npm install in aiyo/, ensure Ollama models from aiyo/.env, docker compose dev (+ mem0 by default).
# Switches: -NoMem0 -SkipNpmInstall -SkipDocker -SkipOllama
param(
    [switch] $NoMem0,
    [switch] $SkipNpmInstall,
    [switch] $SkipDocker,
    [switch] $SkipOllama
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Read-DotEnvMap {
    param([string] $FilePath)
    $map = @{}
    if (-not (Test-Path $FilePath)) { return $map }
    foreach ($raw in Get-Content -LiteralPath $FilePath -Encoding UTF8) {
        $line = $raw.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) { continue }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { continue }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim()
        if ($val.Length -ge 2) {
            $dq = [char]34
            $sq = [char]39
            if (($val.StartsWith($dq) -and $val.EndsWith($dq)) -or ($val.StartsWith($sq) -and $val.EndsWith($sq))) {
                $val = $val.Substring(1, $val.Length - 2)
            }
        }
        $map[$key] = $val
    }
    return $map
}

function Get-OllamaTagNames {
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 8
        $names = @()
        foreach ($m in $resp.models) {
            if ($m.name) { $names += $m.name }
            if ($m.model) { $names += $m.model }
        }
        return ($names | Select-Object -Unique)
    }
    catch {
        return @()
    }
}

function Test-OllamaAlive {
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -Method Get -TimeoutSec 5
        return $true
    }
    catch {
        return $false
    }
}

function Add-UniqueModel {
    param([System.Collections.Generic.List[string]] $List, [string] $Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return }
    $trim = $Name.Trim()
    if ($trim.Length -eq 0) { return }
    $found = $false
    foreach ($x in $List) {
        if ($x.Equals($trim, [System.StringComparison]::OrdinalIgnoreCase)) {
            $found = $true
            break
        }
    }
    if (-not $found) { [void]$List.Add($trim) }
}

function Get-EnvOrDefaultValue {
    param(
        [hashtable] $Map,
        [hashtable] $Defaults,
        [string] $Key
    )
    if ($Map.ContainsKey($Key) -and -not [string]::IsNullOrWhiteSpace($Map[$Key])) {
        return $Map[$Key].Trim()
    }
    if ($Defaults.ContainsKey($Key)) { return $Defaults[$Key] }
    return $null
}

Write-Host "== AIYO dev deploy ($Root) ==" -ForegroundColor Cyan

$envExample = Join-Path $Root "aiyo\.env.example"
$envFile = Join-Path $Root "aiyo\.env"
if (-not (Test-Path $envFile)) {
    if (-not (Test-Path $envExample)) {
        Write-Error "Missing aiyo/.env.example; cannot create aiyo/.env."
        exit 1
    }
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "Created aiyo/.env from .env.example. Edit NEXTAUTH_SECRET and OAuth values." -ForegroundColor Yellow
}

$envMap = Read-DotEnvMap $envFile
$defaults = @{
    OLLAMA_MODEL                     = "gemma4:26B"
    OLLAMA_VIDEO_SUMMARY_MODEL       = "gemma4:26B"
    OLLAMA_VIDEO_SUMMARY_FAST_MODEL  = "mistral-small:24b"
    OLLAMA_VIDEO_SUMMARY_FINAL_MODEL = "gemma4:26B"
    OLLAMA_LOCATION_MODEL            = "qwen3.6:27b"
}

$mem0On = -not $NoMem0
if ($mem0On -and $envMap.ContainsKey("MEM0_ENABLED")) {
    $v = $envMap["MEM0_ENABLED"].Trim().ToLowerInvariant()
    if ($v -eq "false" -or $v -eq "0" -or $v -eq "no") { $mem0On = $false }
}

$models = New-Object "System.Collections.Generic.List[string]"
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_VIDEO_SUMMARY_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_VIDEO_SUMMARY_FAST_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_VIDEO_SUMMARY_FINAL_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_LOCATION_MODEL")

# Match docker-compose mem0-memory defaults (host Ollama)
if ($mem0On) {
    Add-UniqueModel $models "qwen3.5:9b"
    Add-UniqueModel $models "nomic-embed-text"
}

if (-not $SkipNpmInstall) {
    Write-Host ""
    Write-Host "[1/4] npm install (aiyo/)..." -ForegroundColor Cyan
    Push-Location (Join-Path $Root "aiyo")
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install exited with code $LASTEXITCODE" }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host ""
    Write-Host "[1/4] Skipped npm install." -ForegroundColor DarkGray
}

if (-not $SkipOllama) {
    Write-Host ""
    Write-Host "[2/4] Ollama models..." -ForegroundColor Cyan
    $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
    if (-not $ollamaCmd) {
        Write-Error "ollama CLI not found. Install Ollama and add it to PATH."
        exit 1
    }
    if (-not (Test-OllamaAlive)) {
        Write-Error "Cannot reach http://127.0.0.1:11434. Start the Ollama app or run: ollama serve"
        exit 1
    }
    $installed = Get-OllamaTagNames
    foreach ($m in $models) {
        $have = $false
        foreach ($t in $installed) {
            if ($t.Equals($m, [System.StringComparison]::OrdinalIgnoreCase)) {
                $have = $true
                break
            }
            if ($t.StartsWith($m + ":", [System.StringComparison]::OrdinalIgnoreCase)) {
                $have = $true
                break
            }
        }
        if ($have) {
            Write-Host "  present: $m" -ForegroundColor DarkGreen
        }
        else {
            Write-Host "  pulling: $m" -ForegroundColor Yellow
            & ollama pull $m
            if ($LASTEXITCODE -ne 0) { throw "ollama pull $m failed (exit $LASTEXITCODE)" }
        }
    }
}
else {
    Write-Host ""
    Write-Host "[2/4] Skipped Ollama." -ForegroundColor DarkGray
}

if (-not $SkipDocker) {
    Write-Host ""
    Write-Host "[3/4] Mem0 vendor path..." -ForegroundColor Cyan
    & (Join-Path $Root "scripts\clone-mem0.ps1")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host ""
    Write-Host "[4/4] Docker Compose..." -ForegroundColor Cyan
    $composeArgs = @(
        "compose",
        "--env-file", "./aiyo/.env",
        "--profile", "dev",
        "up", "-d", "--build",
        "postgres", "redis", "app-dev"
    )
    if ($mem0On) {
        $composeArgs = @(
            "compose",
            "--env-file", "./aiyo/.env",
            "--profile", "dev",
            "--profile", "mem0",
            "up", "-d", "--build",
            "postgres", "redis", "mem0-memory-postgres", "mem0-memory", "app-dev"
        )
    }
    & docker @composeArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Write-Host ""
    Write-Host "Container status:" -ForegroundColor Cyan
    $psArgs = @("compose", "--profile", "dev", "ps")
    if ($mem0On) { $psArgs = @("compose", "--profile", "dev", "--profile", "mem0", "ps") }
    & docker @psArgs
}
else {
    Write-Host ""
    Write-Host "[3-4/4] Skipped Docker." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. App: http://localhost:3000  Mem0 (if enabled): http://localhost:8890" -ForegroundColor Green
