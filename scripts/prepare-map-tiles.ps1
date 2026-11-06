param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('tw', 'jp', 'kr')]
  [string]$Region
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = Join-Path $root 'map-data/tiles'
New-Item -ItemType Directory -Path $target -Force | Out-Null
$resolved = (Resolve-Path $target).Path
if (-not $resolved.StartsWith((Join-Path $root 'map-data'), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Tile data path escaped the workspace.'
}
$bounds = @{ tw = '119.2,21.8,122.2,25.4'; jp = '122,24,154,46'; kr = '124,33,132,39' }
$mount = "${resolved}:/data"
$zoomArgs = if ($Region -eq 'jp') { @('--max-zoom', '13') } else { @() }
docker run --rm -v $mount versatiles/versatiles:latest convert --bbox-border 3 --bbox $bounds[$Region] @zoomArgs 'https://download.versatiles.org/osm.versatiles' "$Region.versatiles"
if ($LASTEXITCODE -ne 0) { throw 'Tile conversion failed.' }
$frontend = Join-Path $resolved 'frontend.br.tar.gz'
if (-not (Test-Path -LiteralPath $frontend)) {
  Invoke-WebRequest -Uri 'https://github.com/versatiles-org/versatiles-frontend/releases/latest/download/frontend.br.tar.gz' -OutFile $frontend
}
Write-Host "Prepared $Region tiles in $resolved"
