# Loads aiyo/.env (+ optional .env.local) into the current PowerShell session so
# docker compose ${VAR} substitution and build args use project keys, not stale
# Windows user environment variables (e.g. deleted GCP Maps keys).

function Read-AiyoDotEnvMap {
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

function Import-AiyoComposeDotEnv {
    param([string] $Root = (Get-Location).Path)

    $merged = @{}
    foreach ($name in @(".env", ".env.local")) {
        $path = Join-Path $Root "aiyo\$name"
        $fileMap = Read-AiyoDotEnvMap -FilePath $path
        foreach ($entry in $fileMap.GetEnumerator()) {
            $merged[$entry.Key] = $entry.Value
        }
    }

    foreach ($entry in $merged.GetEnumerator()) {
        Set-Item -Path "env:$($entry.Key)" -Value $entry.Value
    }

    return $merged.Count
}

if ($MyInvocation.InvocationName -ne ".") {
    $root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { Get-Location }
    $count = Import-AiyoComposeDotEnv -Root $root
    Write-Host "Imported $count keys from aiyo/.env (+ .env.local if present) for docker compose substitution."
}
