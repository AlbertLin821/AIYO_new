param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('tw', 'jp', 'kr')]
  [string]$Region
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$names = @{ tw = 'taiwan'; jp = 'japan'; kr = 'south-korea' }
$name = $names[$Region]
$target = Join-Path $root "map-data/$Region"
New-Item -ItemType Directory -Path $target -Force | Out-Null
$resolved = (Resolve-Path $target).Path
if (-not $resolved.StartsWith((Join-Path $root 'map-data'), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Map data path escaped the workspace.'
}
$pbf = Join-Path $resolved "$name-latest.osm.pbf"
if (-not (Test-Path -LiteralPath $pbf)) {
  $partial = "$pbf.partial"
  & curl.exe --fail --location --retry 3 --continue-at - --output $partial "https://download.geofabrik.de/asia/$name-latest.osm.pbf"
  if ($LASTEXITCODE -ne 0) { throw 'PBF download failed.' }
  if ((Get-Item -LiteralPath $partial).Length -lt 1024) { throw 'Downloaded PBF is unexpectedly small.' }
  Move-Item -LiteralPath $partial -Destination $pbf
}
$mount = "${resolved}:/data"
$image = 'ghcr.io/project-osrm/osrm-backend:latest'
docker run --rm -v $mount $image osrm-extract -p /opt/car.lua "/data/$name-latest.osm.pbf"
if ($LASTEXITCODE -ne 0) { throw 'OSRM extract failed.' }
docker run --rm -v $mount $image osrm-partition "/data/$name-latest.osrm"
if ($LASTEXITCODE -ne 0) { throw 'OSRM partition failed.' }
docker run --rm -v $mount $image osrm-customize "/data/$name-latest.osrm"
if ($LASTEXITCODE -ne 0) { throw 'OSRM customize failed.' }
Write-Host "Prepared $Region OSRM data in $resolved"
