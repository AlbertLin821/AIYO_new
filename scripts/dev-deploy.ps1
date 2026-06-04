#Requires -Version 5.1
param(
    [switch] $SkipNpmInstall,
    [switch] $SkipDocker,
    [switch] $SkipOllama,
    [switch] $NoMem0
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$script:StageIndex = 0
$script:StageTotal = 3
$script:LogDir = Join-Path $Root ".logs\dev-deploy"
$script:StageStopwatches = @{}
$script:StageDurations = @{}
$script:StageOrder = New-Object "System.Collections.Generic.List[string]"
$script:OverallStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null

function Read-DotEnvMap {
    param([string] $FilePath)
    $map = @{}
    if (-not (Test-Path -LiteralPath $FilePath)) { return $map }
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
    foreach ($x in $List) {
        if ($x.Equals($trim, [System.StringComparison]::OrdinalIgnoreCase)) {
            return
        }
    }
    [void]$List.Add($trim)
}

function Write-DeployBanner {
    Write-Host ""
    Write-Host "AIYO dev deploy" -ForegroundColor Cyan
    Write-Host "Root : $Root" -ForegroundColor DarkGray
    if ($NoMem0) {
        Write-Host "Mem0 : ignored (stack retired from active compose)" -ForegroundColor DarkGray
    }
    Write-Host ""
}

function Format-Duration {
    param([TimeSpan] $Duration)
    if ($Duration.TotalHours -ge 1) {
        return "{0:hh\:mm\:ss}" -f $Duration
    }
    return "{0:mm\:ss}" -f $Duration
}

function Start-Stage {
    param([string] $Title, [string] $Status)
    $script:StageIndex += 1
    $percent = [int](($script:StageIndex - 1) / $script:StageTotal * 100)
    $script:StageStopwatches[$Title] = [System.Diagnostics.Stopwatch]::StartNew()
    [void]$script:StageOrder.Add($Title)
    Write-Progress -Id 1 -Activity "AIYO dev deploy" -Status $Status -PercentComplete $percent
    Write-Host ("[{0}/{1}] {2}" -f $script:StageIndex, $script:StageTotal, $Title) -ForegroundColor Cyan
}

function Complete-Stage {
    param([string] $Title, [string] $Message)
    $elapsed = [TimeSpan]::Zero
    if ($script:StageStopwatches.ContainsKey($Title)) {
        $script:StageStopwatches[$Title].Stop()
        $elapsed = $script:StageStopwatches[$Title].Elapsed
        $script:StageDurations[$Title] = $elapsed
    }
    $percent = [int]($script:StageIndex / $script:StageTotal * 100)
    Write-Progress -Id 1 -Activity "AIYO dev deploy" -Status $Message -PercentComplete $percent
    Write-Host ("  OK  {0} ({1})" -f $Message, (Format-Duration $elapsed)) -ForegroundColor DarkGreen
    Write-Host ""
}

function Skip-Stage {
    param([string] $Title, [string] $Message)
    if ($script:StageStopwatches.ContainsKey($Title)) {
        $script:StageStopwatches[$Title].Stop()
        $script:StageDurations[$Title] = [TimeSpan]::Zero
    }
    $percent = [int]($script:StageIndex / $script:StageTotal * 100)
    Write-Progress -Id 1 -Activity "AIYO dev deploy" -Status $Message -PercentComplete $percent
    Write-Host ("  SKIP {0}" -f $Message) -ForegroundColor DarkGray
    Write-Host ""
}

function New-StepLogPath {
    param([string] $Name)
    $safeName = ($Name -replace "[^a-zA-Z0-9\-_]", "_")
    return Join-Path $script:LogDir ("{0:yyyyMMdd-HHmmss}_{1}.log" -f (Get-Date), $safeName)
}

function Show-LogTail {
    param([string] $LogPath, [int] $Tail = 80)
    if (-not (Test-Path $LogPath)) { return }
    Write-Host "  Last log lines ($LogPath):" -ForegroundColor Yellow
    Get-Content -LiteralPath $LogPath -Tail $Tail
}

function Invoke-LoggedCommand {
    param(
        [string] $Name,
        [scriptblock] $Command,
        [string] $Workdir
    )
    $logPath = New-StepLogPath $Name
    Push-Location $Workdir
    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            & $Command *> $logPath
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        if ($LASTEXITCODE -ne 0) {
            Show-LogTail -LogPath $logPath
            throw "$Name failed (exit $LASTEXITCODE). Full log: $logPath"
        }
        Write-Host ("  log  {0}" -f $logPath) -ForegroundColor DarkGray
    }
    finally {
        Pop-Location
    }
}

function Write-FinalStageSummary {
    Write-Host "Stage summary:" -ForegroundColor Cyan
    foreach ($title in $script:StageOrder) {
        Write-Host ("  - {0}: {1}" -f $title, (Format-Duration $script:StageDurations[$title])) -ForegroundColor DarkGray
    }
    Write-Host ("  - Total: {0}" -f (Format-Duration $script:OverallStopwatch.Elapsed)) -ForegroundColor DarkGray
    Write-Host ""
}

$envExample = Join-Path $Root "aiyo\.env.dev.example"
$envFile = Join-Path $Root "aiyo\.env.dev"
if (-not (Test-Path -LiteralPath $envFile)) {
    if (-not (Test-Path -LiteralPath $envExample)) {
        Write-Error "Missing aiyo/.env.dev.example; cannot create aiyo/.env.dev."
        exit 1
    }
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "Created aiyo/.env.dev from .env.dev.example. Edit NEXTAUTH_SECRET and OPENWEBUI_API_KEY before live AI verification." -ForegroundColor Yellow
}

$envMap = Read-DotEnvMap $envFile
$models = New-Object "System.Collections.Generic.List[string]"
foreach ($key in @(
    "OLLAMA_MODEL",
    "OLLAMA_TRAVEL_CHAT_MODEL",
    "OLLAMA_TRIP_PLAN_MODEL",
    "OLLAMA_VIDEO_SUMMARY_MODEL",
    "OLLAMA_VIDEO_SUMMARY_FAST_MODEL",
    "OLLAMA_VIDEO_SUMMARY_FINAL_MODEL",
    "OLLAMA_LOCATION_MODEL"
)) {
    Add-UniqueModel $models $envMap[$key]
}

Write-DeployBanner

Start-Stage -Title "Node dependencies" -Status "Installing npm packages"
if ($SkipNpmInstall) {
    Skip-Stage -Title "Node dependencies" -Message "npm install skipped"
}
else {
    Invoke-LoggedCommand -Name "npm_install" -Workdir (Join-Path $Root "aiyo") -Command {
        npm install
    }
    Complete-Stage -Title "Node dependencies" -Message "npm install completed"
}

Start-Stage -Title "Ollama models" -Status "Checking local Ollama"
if ($SkipOllama) {
    Skip-Stage -Title "Ollama models" -Message "Ollama step skipped"
}
else {
    $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
    if (-not $ollamaCmd) {
        throw "ollama CLI not found. Install Ollama and add it to PATH."
    }
    if (-not (Test-OllamaAlive)) {
        throw "Cannot reach http://127.0.0.1:11434. Start the Ollama app or run: ollama serve"
    }

    $installed = Get-OllamaTagNames
    foreach ($modelName in $models) {
        $have = $false
        foreach ($tag in $installed) {
            if ($tag.Equals($modelName, [System.StringComparison]::OrdinalIgnoreCase) -or $tag.StartsWith($modelName + ":", [System.StringComparison]::OrdinalIgnoreCase)) {
                $have = $true
                break
            }
        }
        if ($have) {
            Write-Host ("  present  {0}" -f $modelName) -ForegroundColor DarkGreen
            continue
        }

        Write-Host ("  pulling  {0}" -f $modelName) -ForegroundColor Yellow
        & ollama pull $modelName
        if ($LASTEXITCODE -ne 0) {
            throw "ollama pull $modelName failed (exit $LASTEXITCODE)"
        }
    }
    Complete-Stage -Title "Ollama models" -Message "Ollama models ready"
}

Start-Stage -Title "Docker Compose" -Status "Building and starting containers"
if ($SkipDocker) {
    Skip-Stage -Title "Docker Compose" -Message "Docker compose skipped"
}
else {
    . (Join-Path $Root "scripts\import-compose-dotenv.ps1")
    $null = Import-AiyoComposeDotEnv -Root $Root -Mode dev

    $composeEnvArgs = @("--env-file", "./aiyo/.env.dev")
    $services = @(
        "aiyo-new-postgres-dev",
        "aiyo-new-redis",
        "open-webui",
        "aiyo-new-app-dev"
    )
    $buildArgs = @("compose") + $composeEnvArgs + @("build") + $services
    $upArgs = @("compose") + $composeEnvArgs + @("up", "-d", "--force-recreate", "--no-build") + $services
    $psArgs = @("compose") + $composeEnvArgs + @("ps")

    Invoke-LoggedCommand -Name "docker_compose_build" -Workdir $Root -Command {
        & docker @buildArgs
    }
    Invoke-LoggedCommand -Name "docker_compose_up" -Workdir $Root -Command {
        & docker @upArgs
    }

    Complete-Stage -Title "Docker Compose" -Message "Containers are up"
    & docker @psArgs
}

$script:OverallStopwatch.Stop()
Write-Progress -Id 1 -Activity "AIYO dev deploy" -Completed
Write-Host ""
Write-FinalStageSummary
Write-Host "Done. App: http://127.0.0.1:3000  OpenWebUI: http://127.0.0.1:8080" -ForegroundColor Green
