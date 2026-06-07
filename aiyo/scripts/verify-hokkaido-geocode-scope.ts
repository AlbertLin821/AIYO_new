/**
 * Verify video summary locations stay in Japan when user trip destination is Taiwan.
 * Run: cd aiyo && npx tsx scripts/verify-hokkaido-geocode-scope.ts [videoId]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { summarizeVideoForApi } from "../src/server/services/videoSummaryConnector";
import { resolveVideoSummaryDestinationContext } from "../src/server/services/videoSummaryService";
import {
  isExplicitDepartureOrForeignPlace,
  isTextInTripDestinationScope,
  resolveTripDestinationScope,
} from "../src/lib/tripDestinationScope";

function loadEnvDev() {
  try {
    const envPath = resolve(process.cwd(), ".env.dev");
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional local env
  }
}

loadEnvDev();

const TAIWAN_LAT_MAX = 26;
const TAIWAN_LNG_MIN = 119;
const TAIWAN_LNG_MAX = 122.5;
const JAPAN_LAT_MIN = 30;

function isLikelyTaiwanCoord(lat: number, lng: number): boolean {
  return lat <= TAIWAN_LAT_MAX && lng >= TAIWAN_LNG_MIN && lng <= TAIWAN_LNG_MAX;
}

function isLikelyJapanCoord(lat: number, lng: number): boolean {
  return lat >= JAPAN_LAT_MIN && lng >= 122;
}

async function main() {
  const videoId = process.argv[2] || "BAyQ10iPK4M";
  const title =
    process.argv[3] ||
    "北海道自由行 札幌 小樽 函館 美食景點攻略";

  const context = resolveVideoSummaryDestinationContext({
    destinationHint: "台灣",
    title,
    description: "Hokkaido Sapporo Otaru Hakodate travel vlog",
    transcriptLanguage: "zh-TW",
  });

  console.log("--- destination context (user=台灣, video=北海道) ---");
  console.log(JSON.stringify(context, null, 2));

  const result = await summarizeVideoForApi({
    videoId,
    title,
    destination: "台灣",
    refresh: true,
  });

  const locations = result.video.extractedLocations || [];
  const rows = locations.map((loc) => {
    const lat = loc.lat;
    const lng = loc.lng;
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    return {
      name: loc.name,
      verified: loc.verified,
      lat,
      lng,
      address: loc.address?.slice(0, 100),
      resolvedFrom: loc.resolvedFrom,
      inTaiwan: hasCoords ? isLikelyTaiwanCoord(lat as number, lng as number) : null,
      inJapan: hasCoords ? isLikelyJapanCoord(lat as number, lng as number) : null,
    };
  });

  const verifiedRows = rows.filter((r) => r.verified === true && r.inTaiwan !== null);
  const japanScope = resolveTripDestinationScope("日本");
  const misScopedTaiwanVerified = verifiedRows.filter((r) => {
    if (r.inTaiwan !== true) {
      return false;
    }
    if (isExplicitDepartureOrForeignPlace(r.name, "TW")) {
      return false;
    }
    return japanScope
      ? isTextInTripDestinationScope(r.name, japanScope, { strictCountryLevel: true })
      : false;
  });
  const allowedTaiwanDeparture = verifiedRows.filter(
    (r) => r.inTaiwan === true && isExplicitDepartureOrForeignPlace(r.name, "TW"),
  );
  const taiwanVerified = verifiedRows.filter((r) => r.inTaiwan === true);
  const japanVerified = verifiedRows.filter((r) => r.inJapan === true);

  console.log("\n--- summarize result ---");
  console.log(
    JSON.stringify(
      {
        videoId: result.video.videoId,
        title: result.title,
        segmentCount: result.segments.length,
        locationCount: locations.length,
        taiwanVerifiedCount: taiwanVerified.length,
        allowedTaiwanDepartureCount: allowedTaiwanDeparture.length,
        misScopedTaiwanVerifiedCount: misScopedTaiwanVerified.length,
        japanVerifiedCount: japanVerified.length,
        verifiedGeocodedCount: verifiedRows.length,
        debug: result.debug,
      },
      null,
      2,
    ),
  );
  console.log("\n--- locations ---");
  console.log(JSON.stringify(rows, null, 2));

  if (misScopedTaiwanVerified.length > 0) {
    console.error("\nFAIL: mis-scoped Japan place names verified in Taiwan bbox");
    console.error(JSON.stringify(misScopedTaiwanVerified, null, 2));
    process.exit(1);
  }
  if (allowedTaiwanDeparture.length > 0) {
    console.log("\nOK: Taiwan departure POIs allowed:", allowedTaiwanDeparture.map((r) => r.name).join(", "));
  }
  if (verifiedRows.length === 0 && locations.length > 0) {
    console.warn("\nWARN: locations extracted but none verified+geocoded for map");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
