$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
& "$PSScriptRoot\scripts\dev-deploy.ps1" @args
exit $LASTEXITCODE
