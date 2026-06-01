import assert from "node:assert/strict";
import test from "node:test";

import { getItineraryItemTitleViolation } from "@/lib/itineraryPlaceTitle";
import {
  INSUFFICIENT_RESEARCH_WARNING,
  getDayItemCountBounds,
} from "@/server/ai/planning/itineraryPlanningStandard";
import { validateItineraryQuality } from "@/server/ai/planning/itineraryQualityValidator";
import { buildTripPlanResearchPlan } from "@/server/ai/planning/tripPlanResearchPolicy";
import { filterTripPlanByDestinationScope } from "@/server/services/filterTripPlanByDestinationScope";
import { buildFallbackTripPlan, generateTripPlan } from "@/server/services/travelPlannerService";
import type { PlaceSearchHit } from "@/server/geo/placesSearchService";
import type { TripPlanRequest } from "@/types";

function tokyo3D2NRequest(): TripPlanRequest {
  return {
    destination: "東京",
    days: 3,
    preferences: {
      interests: ["美食", "逛街"],
      pace: "moderate",
      transportPreference: "public_transport",
      notes: "幫我安排東京三天兩夜，輕鬆一點",
    },
  };
}

function mockTokyoPlaceHits(): PlaceSearchHit[] {
  return [
    {
      name: "淺草寺",
      placeId: "p1",
      lat: 35.7148,
      lng: 139.7967,
      types: ["tourist_attraction"],
    },
    {
      name: "東京晴空塔",
      placeId: "p2",
      lat: 35.7101,
      lng: 139.8107,
      types: ["tourist_attraction"],
    },
    {
      name: "築地場外市場",
      placeId: "p3",
      lat: 35.6654,
      lng: 139.7707,
      types: ["restaurant"],
    },
    {
      name: "表參道",
      placeId: "p4",
      lat: 35.6672,
      lng: 139.7076,
      types: ["shopping_mall"],
    },
  ] as PlaceSearchHit[];
}

function australia5D4NRequest(): TripPlanRequest {
  return {
    destination: "澳洲",
    days: 5,
    preferences: {
      interests: ["景點", "美食"],
      pace: "moderate",
      transportPreference: "public_transport",
      notes: "我想要去澳洲玩五天四夜",
    },
  };
}

function mockAustraliaPlaceHits(): PlaceSearchHit[] {
  return [
    {
      name: "Sydney Opera House",
      formattedAddress: "Bennelong Point, Sydney NSW 2000, Australia",
      placeId: "au_1",
      lat: -33.8568,
      lng: 151.2153,
      types: ["tourist_attraction"],
    },
    {
      name: "Queen Victoria Market",
      formattedAddress: "Queen St, Melbourne VIC 3000, Australia",
      placeId: "au_2",
      lat: -37.8068,
      lng: 144.9568,
      types: ["tourist_attraction", "food"],
    },
  ] as PlaceSearchHit[];
}

function mockTaiwanPlaceHits(): PlaceSearchHit[] {
  return [
    {
      name: "台北 101",
      formattedAddress: "台灣台北市信義區信義路五段7號",
      placeId: "tw_1",
      lat: 25.0339,
      lng: 121.5645,
      types: ["tourist_attraction"],
    },
  ] as PlaceSearchHit[];
}

function mockHongKongAustraliaNamedPlaceHits(): PlaceSearchHit[] {
  return [
    {
      name: "澳洲牛奶公司",
      formattedAddress: "香港佐敦白加士街47號",
      placeId: "hk_au_name_only",
      lat: 22.3048,
      lng: 114.1711,
      types: ["restaurant", "food"],
    },
  ] as PlaceSearchHit[];
}

test("buildTripPlanResearchPlan for Tokyo 3D2N without dates requests POI only", () => {
  const plan = buildTripPlanResearchPlan(tokyo3D2NRequest());

  assert.equal(plan.shouldResearch, true);
  assert.ok(plan.toolRequests.some((req) => req.type === "search_place"));
  assert.equal(
    plan.toolRequests.some((req) => req.type === "weather_forecast"),
    false,
  );
  assert.equal(plan.webSearchQueries.length, 0);
});

test("Tokyo 3D2N place-hit itinerary has no template pollution titles", () => {
  const hits = mockTokyoPlaceHits();
  const request = tokyo3D2NRequest();
  const plan = {
    summary: "東京三天兩夜",
    days: [1, 2, 3].map((dayNumber) => {
      const bounds = getDayItemCountBounds(dayNumber, 3);
      const place = hits[(dayNumber - 1) % hits.length];
      return {
        dayNumber,
        items: [
          {
            id: `d${dayNumber}_1`,
            time: "10:00",
            title: place.name,
            type: "attraction" as const,
            transport: "大眾運輸",
          },
          {
            id: `d${dayNumber}_meal`,
            time: dayNumber === 3 ? "12:00" : "18:30",
            title: dayNumber === 3 ? "午餐" : "晚餐",
            type: "restaurant" as const,
            transport: "步行",
            notes: "於表參道一帶安排用餐。",
          },
        ].slice(0, Math.max(2, bounds.min)),
      };
    }),
    warnings: [INSUFFICIENT_RESEARCH_WARNING],
  };

  for (const day of plan.days) {
    for (const item of day.items) {
      assert.equal(getItineraryItemTitleViolation(item.title), null, item.title);
    }
  }

  const issues = validateItineraryQuality(plan, request);
  assert.equal(
    issues.some((issue) => issue.message.includes("代表性景點")),
    false,
  );
});

test("buildTripPlanResearchPlan resolves within performance budget", () => {
  const started = performance.now();
  for (let index = 0; index < 200; index += 1) {
    buildTripPlanResearchPlan(tokyo3D2NRequest());
  }
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 500, `research plan too slow: ${elapsed}ms`);
});

test("fallback with no verified research still returns sparse travel plan with warnings", () => {
  const request = tokyo3D2NRequest();
  const plan = buildFallbackTripPlan(request, []);

  assert.equal(plan.days.length, 3);
  assert.ok(plan.warnings?.some((warning) => warning.includes(INSUFFICIENT_RESEARCH_WARNING)));
  assert.ok(plan.warnings?.some((warning) => warning.includes("僅根據可驗證地點建立")));

  const allTitles = plan.days.flatMap((day) => day.items.map((item) => item.title));
  for (const forbidden of ["代表性景點", "文化體驗", "市區自由探索", "河岸散策", "夜景收尾"]) {
    assert.equal(allTitles.some((title) => title.includes(forbidden)), false, forbidden);
  }

  const issues = validateItineraryQuality(plan, request, { researchInsufficient: true });
  assert.deepEqual(issues, []);
});

test("fallback only uses verified place hits for concrete POI titles", () => {
  const request = tokyo3D2NRequest();
  const plan = buildFallbackTripPlan(request, mockTokyoPlaceHits());
  const verifiedNames = new Set(mockTokyoPlaceHits().map((place) => place.name));
  const concreteTitles = plan.days
    .flatMap((day) => day.items)
    .filter((item) => item.type !== "restaurant" || !["午餐", "晚餐", "Lunch", "Dinner"].includes(item.title))
    .map((item) => item.title);

  assert.ok(concreteTitles.length > 0);
  assert.ok(concreteTitles.every((title) => verifiedNames.has(title)), concreteTitles.join(", "));
});

test("Australia fallback filters out Taiwan place hits and clears first-leg route metadata", async () => {
  const originalFetch = globalThis.fetch;
  const originalGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "";
  globalThis.fetch = async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    throw abortError;
  };

  try {
    const generated = await generateTripPlan(australia5D4NRequest());
    const titles = generated.plan.days.flatMap((day) => day.items.map((item) => item.title));
    assert.equal(titles.some((title) => /台北|台灣|臺灣/.test(title)), false, titles.join(", "));
    for (const day of generated.plan.days) {
      const first = day.items[0];
      if (!first) {
        continue;
      }
      assert.equal(first.transport || "", "");
      assert.equal(first.transportDurationMinutes, undefined);
      assert.equal(first.transportDistanceMeters, undefined);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGoogleKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalGoogleKey;
    }
  }
});

test("Australia fallback keeps only Australia place hits when mixed with Taiwan hits", () => {
  const request = australia5D4NRequest();
  const plan = buildFallbackTripPlan(request, [
    ...mockTaiwanPlaceHits(),
    ...mockHongKongAustraliaNamedPlaceHits(),
    ...mockAustraliaPlaceHits(),
  ]);
  const titles = plan.days.flatMap((day) => day.items.map((item) => item.title));
  assert.equal(titles.some((title) => /台北|台灣|臺灣|澳洲牛奶公司/.test(title)), false, titles.join(", "));
  assert.ok(
    titles.some((title) => title === "Sydney Opera House" || title === "Queen Victoria Market"),
    titles.join(", "),
  );
});

test("Australia scope rejects places whose name only contains Australia but address is outside Australia", async () => {
  const filtered = await filterTripPlanByDestinationScope(
    {
      summary: "澳洲五天四夜",
      days: [
        {
          dayNumber: 1,
          items: [
            {
              id: "hk-australia-name",
              time: "10:00",
              title: "澳洲牛奶公司",
              type: "restaurant",
              notes: "香港知名餐廳，不應出現在澳洲行程。",
              location: {
                name: "澳洲牛奶公司",
                address: "香港佐敦白加士街47號",
                lat: 22.3048,
                lng: 114.1711,
              },
            },
            {
              id: "sydney-opera-house",
              time: "13:00",
              title: "Sydney Opera House",
              type: "attraction",
              location: {
                name: "Sydney Opera House",
                address: "Bennelong Point, Sydney NSW 2000, Australia",
                lat: -33.8568,
                lng: 151.2153,
              },
            },
          ],
        },
      ],
    },
    "澳洲",
  );

  const titles = filtered.plan.days.flatMap((day) => day.items.map((item) => item.title));
  assert.deepEqual(titles, ["Sydney Opera House"]);
  assert.equal(filtered.removedCount, 1);
});

test("generateTripPlan returns fallback travel plan when Ollama times out", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    throw abortError;
  };

  try {
    const generated = await generateTripPlan(tokyo3D2NRequest());
    assert.equal(generated.diagnostics.planGenerationMode, "fallback");
    assert.equal(generated.plan.days.length, 3);
    assert.ok(generated.plan.warnings?.some((warning) => warning.includes(INSUFFICIENT_RESEARCH_WARNING)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
