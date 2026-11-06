function baseUrl(name: string, fallback: string): string {
  return (process.env[name]?.trim() || fallback).replace(/\/+$/, "");
}

export const mapServiceConfig = {
  photonBaseUrl: baseUrl("MAP_PHOTON_BASE_URL", "https://photon.komoot.io"),
  overpassBaseUrl: baseUrl("MAP_OVERPASS_BASE_URL", "https://overpass-api.de/api/interpreter"),
  osrmBaseUrl: baseUrl("MAP_OSRM_BASE_URL", "https://router.project-osrm.org"),
  allowPublicFallback: process.env.MAP_ALLOW_PUBLIC_FALLBACK !== "false",
  regionalOverpass: {
    TW: process.env.MAP_OVERPASS_TW_URL?.trim(),
    JP: process.env.MAP_OVERPASS_JP_URL?.trim(),
    KR: process.env.MAP_OVERPASS_KR_URL?.trim(),
  },
  regionalOsrm: {
    TW: process.env.MAP_OSRM_TW_URL?.trim(),
    JP: process.env.MAP_OSRM_JP_URL?.trim(),
    KR: process.env.MAP_OSRM_KR_URL?.trim(),
  },
  defaultLanguage: process.env.MAP_DEFAULT_LANGUAGE?.trim() || "zh-TW",
  defaultCountry: process.env.MAP_DEFAULT_COUNTRY?.trim() || "TW",
  searchCacheTtlMs: Number(process.env.MAP_SEARCH_CACHE_TTL_SECONDS || 86400) * 1000,
  nearbyCacheTtlMs: Number(process.env.MAP_NEARBY_CACHE_TTL_SECONDS || 900) * 1000,
  routeCacheTtlMs: Number(process.env.MAP_ROUTE_CACHE_TTL_SECONDS || 3600) * 1000,
};

