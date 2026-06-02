#Requires -Version 5.1
param(
    [switch] $NoMem0,
    [switch] $SkipNpmInstall,
    [switch] $SkipDocker,
    [switch] $SkipOllama
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$script:StageIndex = 0
$script:StageTotal = 4
$script:LogDir = Join-Path $Root ".logs\dev-deploy"
$script:StageStopwatches = @{}
$script:StageDurations = @{}
$script:StageOrder = New-Object "System.Collections.Generic.List[string]"
$script:OverallStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null

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
    foreach ($x in $List) {
        if ($x.Equals($trim, [System.StringComparison]::OrdinalIgnoreCase)) {
            return
        }
    }
    [void]$List.Add($trim)
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

function Write-DeployBanner {
    Write-Host ""
    Write-Host "AIYO dev deploy" -ForegroundColor Cyan
    Write-Host "Root : $Root" -ForegroundColor DarkGray
    Write-Host "Mem0 : $(if ($mem0On) { 'enabled' } else { 'disabled' })" -ForegroundColor DarkGray
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
    param(
        [string] $Title,
        [string] $Status
    )
    $script:StageIndex += 1
    $percent = [int](($script:StageIndex - 1) / $script:StageTotal * 100)
    $script:StageStopwatches[$Title] = [System.Diagnostics.Stopwatch]::StartNew()
    [void]$script:StageOrder.Add($Title)
    Write-Progress -Id 1 -Activity "AIYO dev deploy" -Status $Status -PercentComplete $percent
    Write-Host ("[{0}/{1}] {2}" -f $script:StageIndex, $script:StageTotal, $Title) -ForegroundColor Cyan
}

function Complete-Stage {
    param(
        [string] $Title,
        [string] $Message
    )
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
    param(
        [string] $Title,
        [string] $Message
    )
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
    param(
        [string] $LogPath,
        [int] $Tail = 80
    )
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

function Write-ServiceTargetList {
    param(
        [string] $Label,
        [string[]] $Services
    )
    Write-Host ("  {0}" -f $Label) -ForegroundColor DarkGray
    foreach ($service in $Services) {
        Write-Host ("    - {0}" -f $service) -ForegroundColor DarkGray
    }
}

function Get-DockerComposePsRows {
    param([string[]] $PsArgs)
    try {
        $raw = & docker @($PsArgs + @("--format", "json"))
        if ($LASTEXITCODE -ne 0 -or -not $raw) {
            return @()
        }
        $rows = @()
        foreach ($line in $raw) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            $rows += ($line | ConvertFrom-Json)
        }
        return $rows
    }
    catch {
        return @()
    }
}

function Write-DockerServiceSummary {
    param(
        [string[]] $Services,
        [string[]] $PsArgs
    )
    $rows = Get-DockerComposePsRows -PsArgs $PsArgs
    if (-not $rows.Count) {
        return
    }
    Write-Host "Service summary:" -ForegroundColor Cyan
    foreach ($service in $Services) {
        $row = $rows | Where-Object { $_.Service -eq $service } | Select-Object -First 1
        if ($null -eq $row) {
            Write-Host ("  - {0}: not listed" -f $service) -ForegroundColor Yellow
            continue
        }
        $state = if ($row.State) { $row.State } else { "unknown" }
        $status = if ($row.Status) { $row.Status } else { "" }
        $name = if ($row.Name) { $row.Name } else { $service }
        Write-Host ("  - {0}: {1} | {2} | {3}" -f $service, $name, $state, $status) -ForegroundColor DarkGray
    }
    Write-Host ""
}

function Write-FinalStageSummary {
    Write-Host "Stage summary:" -ForegroundColor Cyan
    foreach ($title in $script:StageOrder) {
        Write-Host ("  - {0}: {1}" -f $title, (Format-Duration $script:StageDurations[$title])) -ForegroundColor DarkGray
    }
    Write-Host ("  - Total: {0}" -f (Format-Duration $script:OverallStopwatch.Elapsed)) -ForegroundColor DarkGray
    Write-Host ""
}

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
    OLLAMA_MODEL                     = "qwen3.5:9b"
    OLLAMA_TRIP_PLAN_MODEL           = "qwen3.5:9b"
    OLLAMA_VIDEO_SUMMARY_MODEL       = "qwen3.5:9b"
    OLLAMA_VIDEO_SUMMARY_FAST_MODEL  = "qwen3.5:9b"
    OLLAMA_VIDEO_SUMMARY_FINAL_MODEL = "qwen3.5:9b"
    OLLAMA_LOCATION_MODEL            = "qwen3.5:9b"
}

$mem0On = -not $NoMem0
if ($mem0On -and $envMap.ContainsKey("MEM0_ENABLED")) {
    $v = $envMap["MEM0_ENABLED"].Trim().ToLowerInvariant()
    if ($v -eq "false" -or $v -eq "0" -or $v -eq "no") { $mem0On = $false }
}

$models = New-Object "System.Collections.Generic.List[string]"
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_TRIP_PLAN_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_VIDEO_SUMMARY_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_VIDEO_SUMMARY_FAST_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_VIDEO_SUMMARY_FINAL_MODEL")
Add-UniqueModel $models (Get-EnvOrDefaultValue $envMap $defaults "OLLAMA_LOCATION_MODEL")
if ($mem0On) {
    Add-UniqueModel $models "qwen3.5:9b"
    Add-UniqueModel $models "nomic-embed-text"
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
    $modelIndex = 0
    foreach ($m in $models) {
        $modelIndex += 1
        $modelPercent = [int]($modelIndex / [Math]::Max($models.Count, 1) * 100)
        Write-Progress -Id 2 -ParentId 1 -Activity "Ollama models" -Status $m -PercentComplete $modelPercent
        $have = $false
        foreach ($t in $installed) {
            if ($t.Equals($m, [System.StringComparison]::OrdinalIgnoreCase) -or $t.StartsWith($m + ":", [System.StringComparison]::OrdinalIgnoreCase)) {
                $have = $true
                break
            }
        }
        if ($have) {
            Write-Host ("  present  {0}" -f $m) -ForegroundColor DarkGreen
            continue
        }

        Write-Host ("  pulling  {0}" -f $m) -ForegroundColor Yellow
        & ollama pull $m
        if ($LASTEXITCODE -ne 0) {
            throw "ollama pull $m failed (exit $LASTEXITCODE)"
        }
    }
    Write-Progress -Id 2 -ParentId 1 -Activity "Ollama models" -Completed
    Complete-Stage -Title "Ollama models" -Message "Ollama models ready"
}

Start-Stage -Title "Mem0 vendor sync" -Status "Preparing vendor/mem0"
if ($SkipDocker) {
    Skip-Stage -Title "Mem0 vendor sync" -Message "Docker and Mem0 sync skipped"
}
else {
    Invoke-LoggedCommand -Name "clone_mem0" -Workdir $Root -Command {
        & (Join-Path $Root "scripts\clone-mem0.ps1")
    }
    Complete-Stage -Title "Mem0 vendor sync" -Message "Mem0 vendor path ready"
}

Start-Stage -Title "Docker Compose" -Status "Building and starting containers"
if ($SkipDocker) {
    Skip-Stage -Title "Docker Compose" -Message "Docker compose skipped"
}
else {
    $composeProfiles = @("--profile", "dev")
    $services = @("postgres", "redis", "app-dev")
    if ($mem0On) {
        $composeProfiles += @("--profile", "mem0")
        $services = @("postgres", "redis", "mem0-memory-postgres", "mem0-memory", "app-dev")
    }

    . (Join-Path $Root "scripts\import-compose-dotenv.ps1")
    $null = Import-AiyoComposeDotEnv -Root $Root

    $composeEnvArgs = @("--env-file", "./aiyo/.env")
    $envLocalPath = Join-Path $Root "aiyo\.env.local"
    if (Test-Path -LiteralPath $envLocalPath) {
        $composeEnvArgs += @("--env-file", "./aiyo/.env.local")
    }

    $buildArgs = @("compose") + $composeEnvArgs + $composeProfiles + @("build") + $services
    $upArgs = @("compose") + $composeEnvArgs + $composeProfiles + @("up", "-d", "--force-recreate", "--no-build") + $services
    $psArgs = @("compose") + $composeEnvArgs + $composeProfiles + @("ps")

    Write-ServiceTargetList -Label "target services" -Services $services

    Invoke-LoggedCommand -Name "docker_compose_build" -Workdir $Root -Command {
        & docker @buildArgs
    }
    Write-ServiceTargetList -Label "built services" -Services $services

    Invoke-LoggedCommand -Name "docker_compose_up" -Workdir $Root -Command {
        & docker @upArgs
    }

    Complete-Stage -Title "Docker Compose" -Message "Containers are up"
    Write-DockerServiceSummary -Services $services -PsArgs $psArgs
    Write-Host "Container status:" -ForegroundColor Cyan
    & docker @psArgs
}

$script:OverallStopwatch.Stop()
Write-Progress -Id 1 -Activity "AIYO dev deploy" -Completed
Write-Host ""
Write-FinalStageSummary
Write-Host "Done. App: http://localhost:3000  Mem0: http://localhost:8890" -ForegroundColor Green
