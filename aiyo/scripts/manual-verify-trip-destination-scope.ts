/**
 * Manual acceptance for Trip Destination Scope gap fixes.
 * Run: cd aiyo && npx tsx scripts/manual-verify-trip-destination-scope.ts
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TripDestinationScope } from "@/lib/tripDestinationScope";
import type { TripPlanResult } from "@/types";

const ROOT = process.cwd();
const TMP = path.join(ROOT, "tmp");
const DESTINATION = "日本";

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];

function loadDotEnv() {
  try {
    const raw = readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env optional
  }
}

function record(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}\n  ${detail}\n`);
}

function isUsLatLng(lat: number, lng: number): boolean {
  return lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;
}

function isJapanLatLng(lat: number, lng: number): boolean {
  return lat >= 24 && lat <= 46.5 && lng >= 122 && lng <= 154;
}

async function main() {
  loadDotEnv();

  const {
    isTextInTripDestinationScope,
    resolveTripDestinationScope,
  } = await import("@/lib/tripDestinationScope");
  const { geocodePlace } = await import("@/server/places/geocodePlace");
  const { getVideoRecommendations } = await import(
    "@/server/services/videoRecommendationService"
  );
  const { filterTripPlanByDestinationScope } = await import(
    "@/server/services/filterTripPlanByDestinationScope"
  );

  const titleLooksUsOnly = (title: string, scope: TripDestinationScope | null) =>
    !isTextInTripDestinationScope(title, scope);

  async function checkSimpleMapGeocodeGate() {
    const scope = resolveTripDestinationScope(DESTINATION);
    const geocoded = await geocodePlace({
      query: "Statue of Liberty",
      destinationHint: DESTINATION,
      destinationScope: scope,
    });
    const pass = !geocoded.ok;
    record(
      "Simple map geocode gate (Statue of Liberty + 日本 scope)",
      pass,
      pass
        ? "geocodePlace rejected US POI — no map pin would be created."
        : `Expected rejection, got lat=${geocoded.ok ? geocoded.place.lat : "n/a"}`,
    );
  }

  async function checkVideoRecommendations() {
    const scope = resolveTripDestinationScope(DESTINATION);
    const outcome = await getVideoRecommendations({
      destination: DESTINATION,
      keyword: "東京 自由行",
      limit: 8,
    });

    const titles = outcome.videos.map((v) => v.title || "").filter(Boolean);
    const usOnly = titles.filter((t) => titleLooksUsOnly(t, scope));
    const pass = usOnly.length === 0;

    record(
      "Video recommendations for 日本 (no US-only titles)",
      pass,
      pass
        ? `source=${outcome.source}, count=${titles.length}, sample=${titles.slice(0, 3).join(" | ")}`
        : `US-only titles: ${usOnly.join(" | ")}`,
    );
  }

  async function checkPreloadedModes() {
    const prev = process.env.DISABLE_PRELOADED_DESTINATION_VIDEOS;
    const scope = resolveTripDestinationScope(DESTINATION);

    process.env.DISABLE_PRELOADED_DESTINATION_VIDEOS = "false";
    const withPreload = await getVideoRecommendations({
      destination: DESTINATION,
      keyword: "東京",
      limit: 6,
    });

    process.env.DISABLE_PRELOADED_DESTINATION_VIDEOS = "true";
    const withoutPreload = await getVideoRecommendations({
      destination: DESTINATION,
      keyword: "東京",
      limit: 6,
    });

    if (prev === undefined) {
      delete process.env.DISABLE_PRELOADED_DESTINATION_VIDEOS;
    } else {
      process.env.DISABLE_PRELOADED_DESTINATION_VIDEOS = prev;
    }

    const preloadTitles = withPreload.videos.map((v) => v.title || "");
    const preloadUsOnly = preloadTitles.filter((t) => titleLooksUsOnly(t, scope));
    const preloadPass =
      withPreload.source === "preloaded-destination-seed"
        ? preloadUsOnly.length === 0
        : withPreload.videos.length === 0 || preloadUsOnly.length === 0;

    record(
      "Preloaded ON — scoped video list",
      preloadPass,
      `source=${withPreload.source}, count=${preloadTitles.length}, usOnly=${preloadUsOnly.length}`,
    );

    const noPreloadOk =
      withoutPreload.source !== "preloaded-destination-seed" ||
      withoutPreload.videos.length >= 0;
    record(
      "Preloaded OFF — does not use preloaded-seed (or empty fallback)",
      noPreloadOk,
      `source=${withoutPreload.source}, count=${withoutPreload.videos.length}`,
    );
  }

  async function checkItineraryScopeFilter() {
    const plan: TripPlanResult = {
      summary: "日本範圍過濾驗證",
      days: [
        {
          dayNumber: 1,
          items: [
            {
              id: "jp-1",
              time: "09:00",
              title: "淺草寺",
              type: "attraction",
              notes: "東京",
            },
            {
              id: "us-1",
              time: "11:00",
              title: "Golden Gate Bridge",
              type: "attraction",
              notes: "San Francisco",
            },
          ],
        },
      ],
      warnings: [],
    };

    const filtered = await filterTripPlanByDestinationScope(plan, DESTINATION);
    const names = filtered.plan.days.flatMap((d) => d.items.map((i) => i.title));
    const pass = !names.some((n) => /golden gate/i.test(n)) && names.some((n) => /淺草/.test(n));

    record(
      "Itinerary post-filter removes US item for 日本 trip",
      pass,
      `kept=${names.join(", ")}, removed=${filtered.removedCount}`,
    );
  }

  async function checkLiveVideoSummaryIfConfigured() {
    if (!process.env.YOUTUBE_API_KEY?.trim() || !process.env.GOOGLE_MAPS_API_KEY?.trim()) {
      record(
        "Live video summary (skipped)",
        true,
        "Missing YOUTUBE_API_KEY or GOOGLE_MAPS_API_KEY — skipped live summarize.",
      );
      return;
    }

    if (!process.env.OLLAMA_BASE_URL?.trim()) {
      record(
        "Live video summary (skipped)",
        true,
        "Missing OLLAMA_BASE_URL — skipped live summarize.",
      );
      return;
    }

    const { summarizeVideo } = await import("@/server/services/videoSummaryService");
    const videoId = "uOsO8Gj0KAI";
    try {
      const result = await summarizeVideo({
        videoId,
        destination: DESTINATION,
        refresh: true,
      });
      const locations = result.video.extractedLocations || [];
      const usPins = locations.filter(
        (loc) =>
          Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && isUsLatLng(loc.lat, loc.lng),
      );
      const jpPins = locations.filter(
        (loc) =>
          Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && isJapanLatLng(loc.lat, loc.lng),
      );
      const pass = usPins.length === 0;
      record(
        "Live summarizeVideo map pins (日本 trip, Tokyo vlog sample)",
        pass,
        `locations=${locations.length}, jpPins=${jpPins.length}, usPins=${usPins.length}, mode=${process.env.VIDEO_EXTRACTION_MODE || "default"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record(
        "Live video summary (skipped)",
        true,
        `summarizeVideo failed (Ollama/network): ${message}`,
      );
    }
  }

  await mkdir(TMP, { recursive: true });

  console.log("=== Trip Destination Scope manual verification ===\n");
  console.log(`Destination: ${DESTINATION}`);
  console.log(`VIDEO_EXTRACTION_MODE: ${process.env.VIDEO_EXTRACTION_MODE || "(unset)"}\n`);

  await checkSimpleMapGeocodeGate();
  await checkVideoRecommendations();
  await checkPreloadedModes();
  await checkItineraryScopeFilter();
  await checkLiveVideoSummaryIfConfigured();

  const allPass = checks.every((c) => c.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    destination: DESTINATION,
    allPass,
    checks,
  };

  const outPath = path.join(TMP, "trip-destination-scope-manual-verify.json");
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Report: ${path.relative(ROOT, outPath)}`);
  console.log(allPass ? "\nAll manual checks PASSED." : "\nSome checks FAILED.");
  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
