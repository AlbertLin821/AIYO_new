param(
  [switch]$FixOverpassPermissions,
  [ValidateSet('tw', 'jp', 'kr')]
  [string]$Region
)

$ErrorActionPreference = 'Stop'
$regions = @{
  tw = @{ Overpass = 12345; Osrm = 5001; Route = '121.5645,25.0339;121.565,25.034' }
  jp = @{ Overpass = 12346; Osrm = 5002; Route = '139.7966,35.7148;139.8107,35.7101' }
  kr = @{ Overpass = 12347; Osrm = 5003; Route = '126.977,37.5796;126.978,37.58' }
}
$failed = 0
try {
  $photon = Invoke-RestMethod -Uri 'http://127.0.0.1:2322/api?q=%E5%8F%B0%E5%8C%97101&limit=1' -TimeoutSec 10
  if (-not $photon.features -or $photon.features.Count -lt 1) { throw 'No geocoding hits.' }
  Write-Host 'Photon ready: Taipei 101 found'
} catch {
  Write-Warning "Photon unavailable: $($_.Exception.Message)"
  $failed += 1
}
foreach ($regionCode in $regions.Keys) {
  if ($Region -and $Region -ne $regionCode) { continue }
  $config = $regions[$regionCode]
  $container = "aiyo_new-overpass-$regionCode-1"
  if ($FixOverpassPermissions) {
    docker exec $container chmod 755 /db
    if ($LASTEXITCODE -ne 0) { throw "Cannot fix $container permissions." }
  }
  $url = "http://127.0.0.1:$($config.Overpass)/api/interpreter"
  $query = '[out:json][timeout:10];node(1);out;'
  try {
    $response = Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/x-www-form-urlencoded' -Body @{ data = $query } -TimeoutSec 12
    if (-not $response.osm3s) { throw 'Response is not Overpass JSON.' }
    Write-Host "$regionCode ready: $($response.osm3s.timestamp_osm_base)"
  } catch {
    Write-Warning "$regionCode unavailable: $($_.Exception.Message)"
    $failed += 1
  }
  try {
    $routeUrl = "http://127.0.0.1:$($config.Osrm)/route/v1/driving/$($config.Route)?overview=false"
    $route = Invoke-RestMethod -Uri $routeUrl -TimeoutSec 10
    if ($route.code -ne 'Ok' -or -not $route.routes -or $route.routes[0].distance -le 0) { throw 'No usable route.' }
    Write-Host "$regionCode OSRM ready: $([math]::Round($route.routes[0].distance)) m"
  } catch {
    Write-Warning "$regionCode OSRM unavailable: $($_.Exception.Message)"
    $failed += 1
  }
  try {
    $tileJson = Invoke-RestMethod -Uri "http://127.0.0.1:8088/tiles/$regionCode/tiles.json" -TimeoutSec 10
    if (-not $tileJson.tiles -or $tileJson.tiles.Count -lt 1) { throw 'No tile URL.' }
    Write-Host "$regionCode tiles ready: zoom $($tileJson.minzoom)-$($tileJson.maxzoom)"
  } catch {
    Write-Warning "$regionCode tiles unavailable: $($_.Exception.Message)"
    $failed += 1
  }
}
try {
  $searxHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8888/healthz' -TimeoutSec 5
  if ($searxHealth -ne 'OK') { throw 'Unexpected health response.' }
  Write-Host 'SearXNG ready'
} catch {
  Write-Warning "SearXNG unavailable: $($_.Exception.Message)"
  $failed += 1
}
if ($failed -gt 0) { exit 1 }
