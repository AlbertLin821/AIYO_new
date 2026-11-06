const cases = [
  { region: "TW", name: "台北101", lat: 25.0339, lng: 121.5645, nearby: "restaurant", overpass: process.env.BENCHMARK_OVERPASS_TW_LOCAL || "http://127.0.0.1:12345/api/interpreter" },
  { region: "TW", name: "阿里山車站", lat: 23.5105, lng: 120.8025, nearby: "restaurant", overpass: process.env.BENCHMARK_OVERPASS_TW_LOCAL || "http://127.0.0.1:12345/api/interpreter" },
  { region: "JP", name: "浅草寺", lat: 35.7148, lng: 139.7967, nearby: "restaurant", overpass: process.env.BENCHMARK_OVERPASS_JP_LOCAL || "http://127.0.0.1:12346/api/interpreter" },
  { region: "JP", name: "福岡タワー", lat: 33.5932, lng: 130.3515, nearby: "restaurant", overpass: process.env.BENCHMARK_OVERPASS_JP_LOCAL || "http://127.0.0.1:12346/api/interpreter" },
  { region: "KR", name: "경복궁", lat: 37.5796, lng: 126.977, nearby: "restaurant", overpass: process.env.BENCHMARK_OVERPASS_KR_LOCAL || "http://127.0.0.1:12347/api/interpreter" },
  { region: "KR", name: "제주 동문시장", lat: 33.5121, lng: 126.5263, nearby: "restaurant", overpass: process.env.BENCHMARK_OVERPASS_KR_LOCAL || "http://127.0.0.1:12347/api/interpreter" },
];

const photonLocal = process.env.BENCHMARK_PHOTON_LOCAL || "http://127.0.0.1:2322";
const photonPublic = process.env.BENCHMARK_PHOTON_PUBLIC || "https://photon.komoot.io";
const overpassPublic = process.env.BENCHMARK_OVERPASS_PUBLIC || "https://overpass-api.de/api/interpreter";
const photonOnly = process.argv.includes("--photon-only");
const regionFilter = process.argv.find((arg) => arg.startsWith("--regions="))?.split("=")[1]?.split(",").map((value) => value.toUpperCase());
const skipPublic = process.argv.includes("--no-public");
const enforceGate = process.argv.includes("--gate");
const maxReferenceErrorMeters = 500;
const publicAvailability = { photon: true, overpass: true };

function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (a.lat - b.lat) * rad;
  const dLng = (a.lng - b.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

async function photon(base, testCase, publicProvider = false) {
  if (publicProvider && !publicAvailability.photon) return { status: "skipped", reason: "public provider timed out or returned HTTP 406/429 earlier" };
  const start = performance.now();
  try {
    const response = await fetch(`${base}/api?q=${encodeURIComponent(testCase.name)}&limit=5`, { signal: AbortSignal.timeout(10000) });
    if (publicProvider && [406, 429].includes(response.status)) publicAvailability.photon = false;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const distances = (body.features || []).map((feature) => distanceMeters(testCase, { lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0] }));
    return { status: "ok", hits: distances.length, closestMeters: distances.length ? Math.round(Math.min(...distances)) : null, within500m: distances.some((meters) => meters <= maxReferenceErrorMeters), latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    if (publicProvider && (error?.name === "TimeoutError" || error?.name === "AbortError")) publicAvailability.photon = false;
    return { status: "failed", reason: String(error).slice(0, 160), latencyMs: Math.round(performance.now() - start) };
  }
}

async function nearby(testCase, endpoint = testCase.overpass, publicProvider = false) {
  if (publicProvider && !publicAvailability.overpass) return { status: "skipped", reason: "public provider timed out or returned HTTP 406/429 earlier" };
  const start = performance.now();
  const query = `[out:json][timeout:10];(node(around:1500,${testCase.lat},${testCase.lng})[amenity=restaurant];way(around:1500,${testCase.lat},${testCase.lng})[amenity=restaurant];relation(around:1500,${testCase.lat},${testCase.lng})[amenity=restaurant];);out center tags;`;
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(15000) });
    if (publicProvider && [406, 429].includes(response.status)) publicAvailability.overpass = false;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const hits = (body.elements || []).filter((row) => row.tags?.name && distanceMeters(testCase, { lat: row.lat ?? row.center?.lat, lng: row.lon ?? row.center?.lon }) <= 1500);
    return { status: "ok", hits: hits.length, latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    if (publicProvider && (error?.name === "TimeoutError" || error?.name === "AbortError")) publicAvailability.overpass = false;
    return { status: "failed", reason: String(error).slice(0, 160), latencyMs: Math.round(performance.now() - start) };
  }
}

const results = [];
for (const testCase of cases.filter((row) => !regionFilter || regionFilter.includes(row.region))) {
  const [local, existing, nearbyLocal, nearbyExisting] = await Promise.all([
    photon(photonLocal, testCase),
    skipPublic ? Promise.resolve(null) : photon(photonPublic, testCase, true),
    photonOnly ? Promise.resolve(null) : nearby(testCase),
    skipPublic || photonOnly ? Promise.resolve(null) : nearby(testCase, overpassPublic, true),
  ]);
  const localQuality = local.status === "ok" && local.within500m && (photonOnly || nearbyLocal?.status === "ok" && nearbyLocal.hits > 0);
  const publicBaseline = existing?.status === "ok" && existing.hits > 0 && (photonOnly || nearbyExisting?.status === "ok");
  const publicParity = publicBaseline && localQuality && local.closestMeters <= existing.closestMeters + 100
    && (photonOnly || nearbyLocal.hits >= nearbyExisting.hits);
  results.push({ region: testCase.region, place: testCase.name, local, existing, nearbyLocal, nearbyExisting, localQuality, publicBaseline, publicParity });
}
const regions = [...new Set(results.map((row) => row.region))].map((region) => {
  const rows = results.filter((row) => row.region === region);
  return { region, cases: rows.length, localQualityPassed: rows.filter((row) => row.localQuality).length,
    publicBaselinesAvailable: rows.filter((row) => row.publicBaseline).length, publicParityPassed: rows.filter((row) => row.publicParity).length };
});
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), maxReferenceErrorMeters, regions, results }, null, 2));
if (results.some((row) => !row.localQuality)) process.exitCode = 1;
else if (enforceGate && results.some((row) => !row.publicBaseline || !row.publicParity)) process.exitCode = 2;
