import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { applyAssistantActions } from "@/lib/assistantActions/applyAssistantActions";
import { validateAssistantActions } from "@/server/ai/assistantActionValidator";
import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { decideTravelAgentMode } from "@/server/ai/travelAgentOrchestrator";
import { serverConfig } from "@/server/config";
import { runUnifiedWebSearch } from "@/server/search/webSearchService";
import { chatWithTravelAssistant } from "@/server/services/travelPlannerService";
import { useMapStore } from "@/stores/useMapStore";
import { EMPTY_TRIP_STATE, useTripStore } from "@/stores/useTripStore";
import type { ChatContext, PersonalizedAIContext, TripPlanDay } from "@/types";

process.env.AIYO_SKIP_LLM_PATCH = "1";

function makePreferenceContext(
  preferences: NonNullable<AIContextBuildResult["structured"]["preferences"]>,
): AIContextBuildResult {
  const structuredContext: PersonalizedAIContext = {
    userId: "user-1",
    preferences: {
      budgetLevel: preferences.budgetLevel,
      travelStyles: preferences.travelStyle || preferences.travelStyles,
      pace: preferences.pace,
      transportPreference: preferences.transportPreference || null,
      accommodationPreference: preferences.accommodationPreference || null,
    },
    recentTrips: [],
    tripChatHistory: [],
    globalChatMemory: [],
    videoInteractions: [],
    appliedVideoSummaries: [],
    memorySnippets: [],
    contextWarnings: [],
  };
  return {
    text: "使用者偏好：中等預算、美食、購物、適中步調",
    promptContextText: "使用者偏好：中等預算、美食、購物、適中步調",
    sources: ["user_preferences"],
    structured: { preferences, recentTripCount: 0, recentVideoCount: 0, appliedVideoSummaryCount: 0 },
    structuredContext,
    debug: {
      sources: ["user_preferences"],
      includedSources: ["user_preferences"],
      excludedSources: [],
      counts: {},
      limits: {},
      vectorStore: "mem0",
    },
  };
}

function testItinerary(): TripPlanDay[] {
  return [
    {
      dayNumber: 1,
      items: [
        { id: "asakusa", dayNumber: 1, time: "09:00", title: "淺草", type: "attraction" },
        { id: "ueno", dayNumber: 1, time: "13:00", title: "上野", type: "attraction" },
      ],
    },
    {
      dayNumber: 2,
      items: [
        {
          id: "akiba",
          dayNumber: 2,
          time: "10:00",
          title: "秋葉原",
          type: "shopping",
          location: { name: "秋葉原", lat: 35.6984, lng: 139.773, description: "秋葉原" },
        },
        { id: "ginza", dayNumber: 2, time: "15:00", title: "銀座", type: "shopping" },
      ],
    },
    {
      dayNumber: 3,
      items: [
        { id: "shinjuku", dayNumber: 3, time: "10:00", title: "新宿", type: "attraction" },
        { id: "shibuya", dayNumber: 3, time: "15:00", title: "澀谷", type: "attraction" },
      ],
    },
  ];
}

function chatContext(): ChatContext {
  return { destination: "東京", days: 3, itinerary: testItinerary() };
}

beforeEach(() => {
  useTripStore.setState({
    ...EMPTY_TRIP_STATE,
    tripId: "trip-1",
    title: "東京三天",
    destination: "東京",
    days: 3,
    itinerary: testItinerary(),
  });
  useMapStore.setState({
    pins: [
      {
        id: "day_2_akiba",
        name: "秋葉原",
        lat: 35.6984,
        lng: 139.773,
        description: "秋葉原",
        linkedTripItemId: "akiba",
        dayNumber: 2,
        source: "itinerary",
      },
    ],
    selectedPinId: null,
    pendingPoi: null,
    focusLocation: null,
    preferredPoiDay: 1,
    panelOpen: true,
    lastSyncedAt: null,
    segmentDirectionsMinutes: {},
  });
});

test("Phase 5 natural chat does not search generate itinerary or emit actions", async () => {
  const helloDecision = decideTravelAgentMode({ message: "你好" });
  const helpDecision = decideTravelAgentMode({ message: "你可以幫我做什麼？" });
  const helloResponse = await chatWithTravelAssistant({ message: "你好" });

  assert.equal(helloDecision.mode, "casual_chat");
  assert.equal(helloDecision.shouldSearch, false);
  assert.equal(helloDecision.shouldGenerateItinerary, false);
  assert.equal(helloResponse.assistantActions?.length ?? 0, 0);
  assert.equal(helpDecision.shouldSearch, false);
  assert.equal(helpDecision.shouldGenerateItinerary, false);
});

test("Phase 5 preference confirmation reuses known preferences and relaxed override", () => {
  const aiContext = makePreferenceContext({
    budgetLevel: "medium",
    travelStyle: ["food", "shopping"],
    travelStyles: ["food", "shopping"],
    pace: "balanced",
  });

  const first = decideTravelAgentMode({ message: "我想去東京玩三天", aiContext });
  const reuse = decideTravelAgentMode({
    message: "沿用，但排輕鬆一點",
    context: { destination: "東京", days: 3 },
    aiContext,
  });

  assert.equal(first.mode, "confirm_preferences");
  assert.match(first.userFacingGuidance || "", /中等預算/);
  assert.match(first.userFacingGuidance || "", /美食/);
  assert.equal(reuse.mode, "generate_itinerary");
  assert.equal(reuse.preferenceConfirmation?.preferences.pace, "relaxed");
});

test("Phase 5 search decision and Serper fallback stay within allowed providers", async () => {
  const originalFetch = globalThis.fetch;
  const original = {
    provider: serverConfig.webSearchProvider,
    serper: serverConfig.serperApiKey,
    tavily: serverConfig.tavilyApiKey,
  };
  const urls: string[] = [];
  const headers: string[] = [];
  serverConfig.webSearchProvider = "auto";
  serverConfig.serperApiKey = "serper-secret";
  serverConfig.tavilyApiKey = "tavily-secret";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    headers.push(JSON.stringify(init?.headers || {}));
    if (url.includes("api.tavily.com")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        organic: Array.from({ length: 8 }, (_, index) => ({
          title: `東京晴空塔官方 ${index}`,
          link: `https://www.tokyo-skytree.jp/${index}`,
          snippet: "營業時間資訊",
        })),
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const decision = decideTravelAgentMode({ message: "東京晴空塔今天營業到幾點" });
    const result = await runUnifiedWebSearch({
      query: decision.searchDecision?.query || "東京晴空塔 今天 營業時間",
      providers: ["tavily", "serper"],
      limit: 5,
    });

    assert.equal(decision.shouldSearch, true);
    assert.deepEqual(decision.requiredSearchProviders, ["serper", "tavily"]);
    assert.equal(result.backend, "serper");
    assert.ok(result.results.length <= 5);
    assert.ok(!urls.join("\n").includes("serper-secret"));
    assert.ok(headers.join("\n").includes("serper-secret"));
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.webSearchProvider = original.provider;
    serverConfig.serperApiKey = original.serper;
    serverConfig.tavilyApiKey = original.tavily;
  }
});

test("Phase 5 AssistantAction update clears stale map coordinates without relying on legacy proposedChanges", async () => {
  const response = await chatWithTravelAssistant({
    message: "幫我把第二天的秋葉原改成晴空塔",
    structuredTravelPlanning: true,
    context: chatContext(),
  });

  assert.equal(response.travelAgentDecision?.mode, "modify_itinerary");
  assert.equal(response.assistantActions?.[0]?.type, "itinerary.update_item");
  assert.equal(response.proposedChanges?.length ?? 0, 0);

  await applyAssistantActions(response.assistantActions || [], { persist: false });
  const day2 = useTripStore.getState().itinerary.find((day) => day.dayNumber === 2);
  const updated = day2?.items.find((item) => item.id === "akiba");

  assert.equal(updated?.title, "晴空塔");
  assert.equal(updated?.location, undefined);
  assert.equal(useMapStore.getState().pins.some((pin) => pin.linkedTripItemId === "akiba"), false);
});

test("Phase 5 AssistantAction add reorder relaxed day and map focus apply safely", async () => {
  const addResponse = await chatWithTravelAssistant({
    message: "幫我把晴空塔加到第一天下午",
    structuredTravelPlanning: true,
    context: chatContext(),
  });
  await applyAssistantActions(addResponse.assistantActions || [], { persist: false });
  assert.ok(useTripStore.getState().itinerary[0]?.items.some((item) => item.title.includes("晴空塔")));

  const reorderResponse = await chatWithTravelAssistant({
    message: "把第二天順序改成銀座、秋葉原",
    structuredTravelPlanning: true,
    context: chatContext(),
  });
  assert.equal(reorderResponse.assistantActions?.[0]?.type, "itinerary.reorder_items");
  await applyAssistantActions(reorderResponse.assistantActions || [], { persist: false });
  assert.equal(useTripStore.getState().itinerary[1]?.items[0]?.id, "ginza");

  const relaxedResponse = await chatWithTravelAssistant({
    message: "把第三天改成輕鬆一點",
    structuredTravelPlanning: true,
    context: chatContext(),
  });
  assert.ok((relaxedResponse.assistantActions?.length ?? 0) <= 6);
  assert.match(relaxedResponse.reply.content, /輕鬆/);

  const countBeforeFocus = useTripStore.getState().itinerary.flatMap((day) => day.items).length;
  const focusResponse = await chatWithTravelAssistant({
    message: "地圖幫我定位到清水寺",
    structuredTravelPlanning: true,
    context: chatContext(),
  });
  await applyAssistantActions(focusResponse.assistantActions || [], { persist: false });
  const countAfterFocus = useTripStore.getState().itinerary.flatMap((day) => day.items).length;
  assert.equal(focusResponse.assistantActions?.[0]?.type, "map.focus_location");
  assert.equal(countAfterFocus, countBeforeFocus);
  assert.equal(useMapStore.getState().focusLocation?.placeName, "清水寺");
});

test("Phase 5 validator rejects unsafe cross-user empty patch unknown and excessive actions", () => {
  const structuredContext: PersonalizedAIContext = {
    userId: "user-a",
    currentTrip: {
      id: "trip-a",
      days: [
        { id: "day-1", dayNumber: 1, items: [{ id: "item-a", title: "淺草" }] },
      ],
    },
    preferences: {},
    recentTrips: [],
    tripChatHistory: [],
    globalChatMemory: [],
    videoInteractions: [],
    appliedVideoSummaries: [],
    memorySnippets: [],
    contextWarnings: [],
  };
  const result = validateAssistantActions({
    userId: "user-a",
    tripId: "trip-a",
    structuredContext,
    actions: [
      { type: "itinerary.update_item", payload: { tripId: "trip-b", dayId: "day-1", itemId: "item-a", patch: { title: "x" } } },
      { type: "itinerary.update_item", payload: { dayId: "day-1", itemId: "item-a", patch: {} } },
      { type: "itinerary.update_item", payload: { dayId: "day-1", itemId: "item-a", patch: { notes: "<script>alert(1)</script>" } } },
      { type: "unknown.action", payload: {} },
      ...Array.from({ length: 7 }, (_, index) => ({
        type: "map.focus_location",
        payload: { placeName: `Place ${index}` },
      })),
    ],
  });

  assert.ok(result.rejectedActions.some((item) => item.reason.includes("trip")));
  assert.ok(result.rejectedActions.some((item) => item.reason.includes("patch")));
  assert.ok(result.rejectedActions.some((item) => item.reason.includes("dangerous")));
  assert.ok(result.rejectedActions.some((item) => item.reason.includes("unknown")));
  assert.ok(result.warnings.some((warning) => warning.includes("first 6")));
});
