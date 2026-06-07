import { expect, test, type Page, type Route } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "./helpers/auth";
import {
  assertItineraryUnchanged,
  assertOnlyTargetItemChanged,
  captureConsoleErrors,
  captureNetworkFailures,
  fetchBootstrapPayload,
  fetchCurrentTripId,
  fetchPersistedTripFromBootstrap,
  getCurrentItineraryFromUI,
  sendChatAndWaitForCompletion,
  type ChatApiPayload,
} from "./helpers/chat";
import {
  clearE2EOwnerLiveAiState,
  E2E_COLLABORATOR,
  E2E_OWNER,
  resetE2EData,
  seedAuthUsers,
  seedChiayiScenarioForUser,
  seedTokyoPhase7ScenarioForUser,
  type Phase7TokyoSeed,
} from "./helpers/db";
import type { AssistantAction, BootstrapPayload, ChatResponsePayload, TripPlanResult } from "@/types";

test.describe.configure({ mode: "serial" });

const TOKYO_GENERATED_PLAN: TripPlanResult = {
  summary: "東京三天兩夜中等預算自由行，主打美食、逛街與城市散步。",
  days: [
    {
      dayNumber: 1,
      theme: "淺草與上野",
      summary: "傳統街區與公園散步",
      items: [
        {
          id: "d1_i1",
          dayNumber: 1,
          time: "09:30",
          title: "淺草寺",
          type: "attraction",
          transport: "地鐵",
          notes: "早上先從淺草開始，步調放鬆。",
          location: { name: "淺草寺", lat: 35.7148, lng: 139.7967, description: "淺草寺", address: "Tokyo" },
          source: "ai",
        },
        {
          id: "d1_i2",
          dayNumber: 1,
          time: "12:15",
          title: "上野拉麵午餐",
          type: "restaurant",
          transport: "步行",
          notes: "中午安排拉麵。",
          location: { name: "上野", lat: 35.7138, lng: 139.7773, description: "上野", address: "Tokyo" },
          source: "ai",
        },
        {
          id: "d1_i3",
          dayNumber: 1,
          time: "15:00",
          title: "上野公園",
          type: "activity",
          transport: "步行",
          notes: "午後公園散步。",
          location: { name: "上野公園", lat: 35.7156, lng: 139.7745, description: "上野公園", address: "Tokyo" },
          source: "ai",
        },
      ],
    },
    {
      dayNumber: 2,
      theme: "淺草東側與購物",
      summary: "白天景點，晚上購物",
      items: [
        {
          id: "d2_i1",
          dayNumber: 2,
          time: "10:00",
          title: "淺草寺",
          type: "attraction",
          transport: "地鐵",
          notes: "白天先走經典景點。",
          location: { name: "淺草寺", lat: 35.7148, lng: 139.7967, description: "淺草寺", address: "Tokyo" },
          source: "ai",
        },
        {
          id: "d2_i2",
          dayNumber: 2,
          time: "14:00",
          title: "銀座逛街",
          type: "shopping",
          transport: "地鐵",
          notes: "下午逛街。",
          location: { name: "銀座", lat: 35.6717, lng: 139.765, description: "銀座", address: "Tokyo" },
          source: "ai",
        },
        {
          id: "d2_i3",
          dayNumber: 2,
          time: "18:30",
          title: "新宿購物",
          type: "shopping",
          transport: "地鐵",
          notes: "晚上繼續購物。",
          location: { name: "新宿", lat: 35.6938, lng: 139.7034, description: "新宿", address: "Tokyo" },
          source: "ai",
        },
      ],
    },
    {
      dayNumber: 3,
      theme: "澀谷與返程前散步",
      summary: "輕鬆收尾",
      items: [
        {
          id: "d3_i1",
          dayNumber: 3,
          time: "10:30",
          title: "明治神宮",
          type: "attraction",
          transport: "地鐵",
          notes: "早上安排綠意散步。",
          location: { name: "明治神宮", lat: 35.6764, lng: 139.6993, description: "明治神宮", address: "Tokyo" },
          source: "ai",
        },
        {
          id: "d3_i2",
          dayNumber: 3,
          time: "13:00",
          title: "澀谷午餐",
          type: "restaurant",
          transport: "地鐵",
          notes: "返程前吃午餐。",
          source: "ai",
        },
        {
          id: "d3_i3",
          dayNumber: 3,
          time: "15:00",
          title: "澀谷散步",
          type: "activity",
          transport: "步行",
          notes: "保留返程前彈性。",
          location: { name: "澀谷", lat: 35.6595, lng: 139.7005, description: "澀谷", address: "Tokyo" },
          source: "ai",
        },
      ],
    },
  ],
  warnings: [],
};

let tokyoSeed: Phase7TokyoSeed;

function buildTravelPlanResponse(plan: TripPlanResult): ChatResponsePayload {
  return {
    reply: {
      id: `assistant_plan_${Date.now()}`,
      role: "assistant",
      content: "已為你整理一份東京三天兩夜行程，右側行程與地圖會同步更新。",
      timestamp: "10:00",
      responseType: "travel_plan",
    },
    itinerarySuggestion: plan,
    proposedChanges: [],
    assistantActions: [],
  };
}

function buildAssistantReply(input: {
  content: string;
  assistantActions?: AssistantAction[];
  responseType?: string;
  proposedChanges?: [];
}): ChatResponsePayload {
  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: input.content,
      timestamp: "10:00",
      responseType: input.responseType || "text_message",
    },
    assistantActions: input.assistantActions || [],
    proposedChanges: input.proposedChanges || [],
  };
}

function fulfillChat(route: Route, payload: ChatResponsePayload | ChatApiPayload) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: payload }),
  });
}

function geocodeBatchResult(query: string) {
  const map: Record<string, { lat: number; lng: number; formattedAddress: string; placeId: string }> = {
    "淺草寺": { lat: 35.7148, lng: 139.7967, formattedAddress: "Tokyo", placeId: "geo-asakusa" },
    "上野": { lat: 35.7138, lng: 139.7773, formattedAddress: "Tokyo", placeId: "geo-ueno" },
    "上野公園": { lat: 35.7156, lng: 139.7745, formattedAddress: "Tokyo", placeId: "geo-ueno-park" },
    "銀座": { lat: 35.6717, lng: 139.765, formattedAddress: "Tokyo", placeId: "geo-ginza" },
    "新宿": { lat: 35.6938, lng: 139.7034, formattedAddress: "Tokyo", placeId: "geo-shinjuku" },
    "東京晴空塔": { lat: 35.7101, lng: 139.8107, formattedAddress: "Tokyo", placeId: "geo-skytree" },
    "晴空塔": { lat: 35.7101, lng: 139.8107, formattedAddress: "Tokyo", placeId: "geo-skytree" },
    "明治神宮": { lat: 35.6764, lng: 139.6993, formattedAddress: "Tokyo", placeId: "geo-meiji" },
    "澀谷": { lat: 35.6595, lng: 139.7005, formattedAddress: "Tokyo", placeId: "geo-shibuya" },
  };
  return map[query.trim()] || null;
}

async function registerStructuredChatMock(page: Page) {
  await page.route("**/api/runtime-config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        googleMapsApiKey: "",
        googleMapsMapId: "",
        enableMockMaps: true,
        googleAuthEnabled: true,
      }),
    });
  });

  await page.route("**/api/map/geocode", async (route) => {
    const body = route.request().postDataJSON() as { queries?: string[] };
    const results = (body.queries || [])
      .map((query) => {
        const match = geocodeBatchResult(String(query));
        if (!match) {
          return null;
        }
        return {
          query,
          name: query,
          formattedAddress: match.formattedAddress,
          lat: match.lat,
          lng: match.lng,
          placeId: match.placeId,
        };
      })
      .filter(Boolean);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { results } }),
    });
  });

  await page.route("**/api/places/geocode", async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    const query = String(body.query || "");
    const match = geocodeBatchResult(query);
    await route.fulfill({
      status: match ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(
        match
          ? {
              success: true,
              data: {
                place: {
                  placeName: query,
                  formattedAddress: match.formattedAddress,
                  placeId: match.placeId,
                  lat: match.lat,
                  lng: match.lng,
                  provider: "google-geocoding",
                },
              },
            }
          : { success: false, error: { code: "not_found", message: "mock geocode miss" } },
      ),
    });
  });

  await page.route("**/api/ai/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      message?: string;
      context?: { itinerary?: TripPlanResult["days"] };
    };
    const message = String(body.message || "").trim();
    const itinerary = body.context?.itinerary || [];
    const day1 = itinerary.find((day) => day.dayNumber === 1);
    const day2 = itinerary.find((day) => day.dayNumber === 2);
    const day3 = itinerary.find((day) => day.dayNumber === 3);
    const day2First = day2?.items.find((item) => /attraction|activity|shopping/.test(item.type)) || day2?.items[0];
    const day1First = day1?.items[0];
    const lunch = day1?.items.find((item) => item.type === "restaurant" || /^12:/.test(item.time));
    const skytree = day2?.items.find((item) => /晴空塔|Skytree/i.test(item.title) || /晴空塔|Skytree/i.test(item.location?.name || ""));
    const shoppingItems = day2?.items.filter((item) => /shopping/i.test(item.type) || /逛街|購物/.test(item.title)) || [];

    if (message.includes("三天兩夜自由行") && message.includes("東京")) {
      await fulfillChat(route, buildTravelPlanResponse(TOKYO_GENERATED_PLAN));
      return;
    }

    if (message === "第二天主要會去哪幾個地方？") {
      const titles = (day2?.items || []).map((item) => item.title).join("、");
      await fulfillChat(
        route,
        buildAssistantReply({
          content: titles ? `第二天主要會去 ${titles}。` : "目前第二天還沒有行程內容。",
        }),
      );
      return;
    }

    if (message === "你覺得第二天會不會太趕？") {
      const count = day2?.items.length || 0;
      await fulfillChat(
        route,
        buildAssistantReply({
          content:
            count >= 3
              ? `第二天目前有 ${count} 個主要安排，白天景點加上晚間購物，節奏算中等偏滿，但還不至於過趕。`
              : "第二天目前安排不多，節奏不算太趕。",
        }),
      );
      return;
    }

    if (/把第二天的.+改成新宿/u.test(message) && day2First) {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: `已把第二天的 ${day2First.title} 改成新宿。`,
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.update_item",
              payload: {
                dayId: "day-2",
                itemId: day2First.id,
                patch: {
                  title: "新宿",
                  location: "新宿",
                  lat: 35.6938,
                  lng: 139.7034,
                },
              },
            },
          ],
        }),
      );
      return;
    }

    if (message === "第二天下午幫我加一個晴空塔，安排在逛街後面。") {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "已在第二天下午逛街後加入東京晴空塔。",
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.add_item",
              payload: {
                dayId: "day-2",
                item: {
                  title: "東京晴空塔",
                  location: "東京晴空塔",
                  startTime: "16:30",
                  notes: "接在下午逛街之後。",
                  category: "attraction",
                },
              },
            },
          ],
        }),
      );
      return;
    }

    if (message === "刪掉第二天的晴空塔" && skytree) {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "已刪掉第二天的晴空塔。",
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.remove_item",
              payload: { dayId: "day-2", itemId: skytree.id },
            },
          ],
        }),
      );
      return;
    }

    if (message === "刪掉那個逛街的地方") {
      const names = shoppingItems.map((item) => item.title).filter(Boolean);
      await fulfillChat(
        route,
        buildAssistantReply({
          content:
            names.length > 0
              ? `第二天目前有多個逛街安排：${names.join("、")}。請告訴我要刪哪一個。`
              : "我目前看到第二天有逛街相關安排，請告訴我要刪哪一個。",
        }),
      );
      return;
    }

    if (/把第一天的.+改到下午三點/u.test(message) && day1First) {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: `已把第一天的 ${day1First.title} 改到下午三點。`,
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.update_item",
              payload: {
                dayId: "day-1",
                itemId: day1First.id,
                patch: { startTime: "15:00" },
              },
            },
          ],
        }),
      );
      return;
    }

    if (message === "第二天幫我把購物安排到晚上，白天先去景點" && day2) {
      const attractions = day2.items.filter((item) => !/shopping/i.test(item.type) && !/逛街|購物/.test(item.title));
      const shopping = day2.items.filter((item) => /shopping/i.test(item.type) || /逛街|購物/.test(item.title));
      const orderedItemIds = [...attractions, ...shopping].map((item) => item.id);
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "已把第二天的購物安排往後移，白天先走景點。",
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.reorder_items",
              payload: { dayId: "day-2", orderedItemIds },
            },
          ],
        }),
      );
      return;
    }

    if (message === "第二天太滿了，幫我排鬆一點" && day2) {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "我把第二天改得更鬆一些，保留主要景點並拉開時間。",
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.replace_day",
              payload: {
                dayId: "day-2",
                items: [
                  {
                    title: day2.items[0]?.title || "新宿",
                    location: day2.items[0]?.location?.name || day2.items[0]?.title || "新宿",
                    startTime: "10:30",
                    notes: "保留主要景點，早上慢慢開始。",
                    category: day2.items[0]?.type || "attraction",
                  },
                  {
                    title: day2.items[1]?.title || "銀座逛街",
                    location: day2.items[1]?.location?.name || day2.items[1]?.title || "銀座",
                    startTime: "16:00",
                    notes: "下午再安排購物。",
                    category: day2.items[1]?.type || "shopping",
                  },
                ],
              },
            },
          ],
        }),
      );
      return;
    }

    if (message === "整趟幫我改成更悠閒一點，但保留主要景點") {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "已把整趟節奏調得更悠閒，保留主要景點並延後部分時段。",
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "trip.update_metadata",
              payload: { pace: "relaxed" },
            },
            ...(day1?.items[1]
              ? [
                  {
                    type: "itinerary.update_item" as const,
                    payload: { dayId: "day-1", itemId: day1.items[1].id, patch: { startTime: "12:45" } },
                  },
                ]
              : []),
            ...(day3?.items[0]
              ? [
                  {
                    type: "itinerary.update_item" as const,
                    payload: { dayId: "day-3", itemId: day3.items[0].id, patch: { startTime: "11:00" } },
                  },
                ]
              : []),
          ],
        }),
      );
      return;
    }

    if (message === "幫我在地圖上看新宿的位置") {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "我把地圖焦點移到新宿，不會變更目前行程。",
          assistantActions: [{ type: "map.focus_location", payload: { placeName: "新宿", lat: 35.6938, lng: 139.7034, zoom: 15 } }],
        }),
      );
      return;
    }

    if (message === "我第一天午餐吃什麼？") {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: lunch ? `第一天午餐目前是 ${lunch.title}。` : "目前第一天還沒有明確安排午餐，如果你要我可以幫你加進去。",
        }),
      );
      return;
    }

    if (message === "第一天幫我加入一個午餐，想吃拉麵") {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "已在第一天中午加入拉麵午餐。",
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.add_item",
              payload: {
                dayId: "day-1",
                item: {
                  title: "拉麵午餐",
                  location: "新宿拉麵",
                  startTime: "12:30",
                  category: "restaurant",
                  notes: "依你的偏好補上一餐拉麵。",
                },
              },
            },
          ],
        }),
      );
      return;
    }

    if (message === "幫我安排一個壞掉的非 JSON 回覆") {
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: "好的，我幫你安排三天兩夜東京行程……",
      });
      return;
    }

    if (message === "請回傳不存在的 itemId") {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "我已經幫你改好了。",
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.update_item",
              payload: { dayId: "day-2", itemId: "missing-item-id", patch: { title: "不存在的修改" } },
            },
          ],
        }),
      );
      return;
    }

    if (message === "請回傳錯誤的 dayId") {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "我已經幫你改好了。",
          responseType: "itinerary_update",
          assistantActions: [
            {
              type: "itinerary.update_item",
              payload: { dayId: "day-99", itemId: day2First?.id || tokyoSeed.itemIds.day2Akihabara, patch: { title: "錯誤 day" } },
            },
          ],
        }),
      );
      return;
    }

    if (message === "幫我把第一天加入 <script>alert(1)</script>") {
      await fulfillChat(
        route,
        buildAssistantReply({
          content: "這個內容無法直接加入行程，請換成正常的景點或餐廳名稱。",
        }),
      );
      return;
    }

    await fulfillChat(
      route,
      buildAssistantReply({
        content: itinerary.length > 0 ? "我目前會根據右側行程內容回答或修改。" : "目前還沒有可參考的行程。",
      }),
    );
  });
}

async function openChat(page: Page, user = E2E_OWNER) {
  await loginAs(page, user, "/chat");
  await dismissOnboardingIfVisible(page);
  await waitForAuthenticatedSession(page, user.email);
  await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 40_000 });
}

test.beforeAll(async () => {
  await resetE2EData();
  const { owner } = await seedAuthUsers();
  await seedChiayiScenarioForUser(owner.id);
  tokyoSeed = await seedTokyoPhase7ScenarioForUser(owner.id);
});

test.afterAll(async () => {
  await resetE2EData();
});

test("1. 初次生成三天兩夜行程，並可問答不修改", async ({ page }) => {
  test.setTimeout(240_000);
  await clearE2EOwnerLiveAiState();
  await registerStructuredChatMock(page);
  const consoleCapture = captureConsoleErrors(page);
  const networkCapture = captureNetworkFailures(page);

  await openChat(page);

  const response = await sendChatAndWaitForCompletion(
    page,
    "幫我安排東京三天兩夜自由行，我喜歡美食、逛街和城市散步，交通以大眾運輸為主，預算中等。",
    { waitForTripSync: true, chatTimeoutMs: 120_000 },
  );

  expect(response.payload?.data?.reply?.responseType).toBe("travel_plan");
  expect(response.payload?.data?.itinerarySuggestion?.days?.length).toBe(3);

  const persistedTrip = await fetchPersistedTripFromBootstrap(page);
  expect(persistedTrip?.itinerary.length).toBe(3);
  expect((persistedTrip?.pins || []).length).toBeGreaterThan(0);
  for (const day of persistedTrip?.itinerary || []) {
    expect(day.items.length).toBeGreaterThanOrEqual(3);
    for (const item of day.items) {
      expect(item.id).toBeTruthy();
      expect(item.dayNumber).toBe(day.dayNumber);
      expect(item.time).toMatch(/^\d{2}:\d{2}$/);
      expect(item.title).toBeTruthy();
      expect(item.type).toBeTruthy();
    }
  }

  const currentTripId = await fetchCurrentTripId(page);
  expect(currentTripId).toBeTruthy();
  const itineraryUi = await getCurrentItineraryFromUI(page);
  expect(itineraryUi.days.length).toBe(3);

  await page.goto("/map");
  await dismissOnboardingIfVisible(page);
  await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 40_000 });
  const mapPinLocator = page.getByTestId("map-pin-marker");
  await expect
    .poll(async () => mapPinLocator.count().catch(() => 0), {
      timeout: 40_000,
      message: "expected itinerary map pins to render on /map",
    })
    .toBeGreaterThan(0);
  const mapPins = await mapPinLocator.count().catch(() => 0);
  expect(mapPins).toBeGreaterThan(0);
  await page.goto("/chat");
  await dismissOnboardingIfVisible(page);

  const before = await getCurrentItineraryFromUI(page);
  const day2TitlesBefore = before.days.find((day) => day.dayNumber === 2)?.items.map((item) => item.title) || [];

  const qa = await sendChatAndWaitForCompletion(page, "第二天主要會去哪幾個地方？", {
    chatTimeoutMs: 120_000,
  });
  expect(qa.payload?.data?.assistantActions || []).toEqual([]);
  expect(day2TitlesBefore.some((title) => qa.lastAssistantMessage.includes(title))).toBeTruthy();

  const afterQa = await getCurrentItineraryFromUI(page);
  assertItineraryUnchanged(before, afterQa);

  const pace = await sendChatAndWaitForCompletion(page, "你覺得第二天會不會太趕？", {
    chatTimeoutMs: 120_000,
  });
  expect(pace.payload?.data?.assistantActions || []).toEqual([]);
  expect(pace.lastAssistantMessage).toMatch(/第二天|節奏|太趕|安排/u);
  const afterPace = await getCurrentItineraryFromUI(page);
  assertItineraryUnchanged(before, afterPace);

  expect(consoleCapture.errors.filter((entry) => /json parse|schema validation|hydration/i.test(entry.text))).toEqual([]);
  expect(networkCapture.failures).toEqual([]);
  consoleCapture.detach();
  networkCapture.detach();
});

test("2. assistantActions 修改流程會更新面板、地圖並可持久化", async ({ page }) => {
  test.setTimeout(300_000);
  await resetE2EData();
  const { owner } = await seedAuthUsers();
  tokyoSeed = await seedTokyoPhase7ScenarioForUser(owner.id);
  await registerStructuredChatMock(page);
  const consoleCapture = captureConsoleErrors(page);
  const networkCapture = captureNetworkFailures(page);

  await openChat(page);

  const beforeReplace = await getCurrentItineraryFromUI(page);
  const day2Before = await fetchPersistedTripFromBootstrap(page);
  const day2First = day2Before?.itinerary.find((day) => day.dayNumber === 2)?.items[0];
  expect(day2First?.id).toBeTruthy();

  const replace = await sendChatAndWaitForCompletion(page, `把第二天的 ${day2First?.title} 改成新宿`, {
    waitForTripSync: true,
    chatTimeoutMs: 120_000,
  });
  const replaceAction = replace.payload?.data?.assistantActions?.find((action) => action.type === "itinerary.update_item");
  expect(replaceAction).toBeTruthy();
  expect(replaceAction?.payload?.dayId).toBe("day-2");
  expect(replaceAction?.payload?.itemId).toBe(day2First?.id);
  const afterReplace = await getCurrentItineraryFromUI(page);
  assertOnlyTargetItemChanged(beforeReplace, afterReplace, 2, day2First?.title || "");

  const persistedAfterReplace = await fetchPersistedTripFromBootstrap(page);
  const replacedItem = persistedAfterReplace?.itinerary.find((day) => day.dayNumber === 2)?.items.find((item) => item.id === day2First?.id);
  expect(replacedItem?.title).toContain("新宿");
  expect(replacedItem?.location?.name || "").toContain("新宿");

  const beforeAddCount = persistedAfterReplace?.itinerary.find((day) => day.dayNumber === 2)?.items.length || 0;
  const add = await sendChatAndWaitForCompletion(page, "第二天下午幫我加一個晴空塔，安排在逛街後面。", {
    waitForTripSync: true,
    chatTimeoutMs: 120_000,
  });
  const addAction = add.payload?.data?.assistantActions?.find((action) => action.type === "itinerary.add_item");
  expect(addAction?.payload?.dayId).toBe("day-2");
  const persistedAfterAdd = await fetchPersistedTripFromBootstrap(page);
  const day2AfterAdd = persistedAfterAdd?.itinerary.find((day) => day.dayNumber === 2);
  const skytree = day2AfterAdd?.items.find((item) => /晴空塔|Skytree/i.test(item.title) || /晴空塔|Skytree/i.test(item.location?.name || ""));
  expect(day2AfterAdd?.items.length).toBe(beforeAddCount + 1);
  expect(skytree?.title || skytree?.location?.name || "").toMatch(/晴空塔|Skytree/i);

  const beforeDelete = await getCurrentItineraryFromUI(page);
  const del = await sendChatAndWaitForCompletion(page, "刪掉第二天的晴空塔", {
    waitForTripSync: true,
    chatTimeoutMs: 120_000,
  });
  const removeAction = del.payload?.data?.assistantActions?.find((action) => action.type === "itinerary.remove_item");
  expect(removeAction?.payload?.dayId).toBe("day-2");
  expect(removeAction?.payload?.itemId).toBe(skytree?.id);
  const persistedAfterDelete = await fetchPersistedTripFromBootstrap(page);
  const day2AfterDelete = persistedAfterDelete?.itinerary.find((day) => day.dayNumber === 2);
  expect(day2AfterDelete?.items.some((item) => /晴空塔|Skytree/i.test(item.title))).toBe(false);

  const ambiguousBefore = await getCurrentItineraryFromUI(page);
  const ambiguous = await sendChatAndWaitForCompletion(page, "刪掉那個逛街的地方", {
    chatTimeoutMs: 120_000,
  });
  expect(ambiguous.payload?.data?.assistantActions || []).toEqual([]);
  expect(ambiguous.lastAssistantMessage).toMatch(/哪一個|告訴我|逛街安排/u);
  const ambiguousAfter = await getCurrentItineraryFromUI(page);
  assertItineraryUnchanged(ambiguousBefore, ambiguousAfter);

  const day1Target = persistedAfterDelete?.itinerary.find((day) => day.dayNumber === 1)?.items[0];
  const timeChange = await sendChatAndWaitForCompletion(page, `把第一天的 ${day1Target?.title} 改到下午三點`, {
    waitForTripSync: true,
    chatTimeoutMs: 120_000,
  });
  const timeAction = timeChange.payload?.data?.assistantActions?.find((action) => action.type === "itinerary.update_item");
  expect(timeAction?.payload?.dayId).toBe("day-1");
  expect(timeAction?.payload?.itemId).toBe(day1Target?.id);
  const persistedAfterTime = await fetchPersistedTripFromBootstrap(page);
  const timedItem = persistedAfterTime?.itinerary.find((day) => day.dayNumber === 1)?.items.find((item) => item.id === day1Target?.id);
  expect(timedItem?.time).toBe("15:00");

  const reorder = await sendChatAndWaitForCompletion(page, "第二天幫我把購物安排到晚上，白天先去景點", {
    waitForTripSync: true,
    chatTimeoutMs: 120_000,
  });
  const reorderAction = reorder.payload?.data?.assistantActions?.find((action) => action.type === "itinerary.reorder_items");
  const orderedIds = reorderAction?.payload?.orderedItemIds || [];
  const day2Ids = (persistedAfterTime?.itinerary.find((day) => day.dayNumber === 2)?.items || []).map((item) => item.id).sort();
  expect([...orderedIds].sort()).toEqual(day2Ids);

  const relax = await sendChatAndWaitForCompletion(page, "第二天太滿了，幫我排鬆一點", {
    waitForTripSync: true,
    chatTimeoutMs: 120_000,
  });
  expect(relax.payload?.data?.assistantActions?.some((action) => /itinerary\.(replace_day|update_item|remove_item|reorder_items)/.test(action.type))).toBeTruthy();

  const tripRelax = await sendChatAndWaitForCompletion(page, "整趟幫我改成更悠閒一點，但保留主要景點", {
    waitForTripSync: true,
    chatTimeoutMs: 120_000,
  });
  expect((tripRelax.payload?.data?.assistantActions || []).length).toBeLessThanOrEqual(6);

  const mapFocusBefore = await getCurrentItineraryFromUI(page);
  const focus = await sendChatAndWaitForCompletion(page, "幫我在地圖上看新宿的位置", {
    chatTimeoutMs: 120_000,
  });
  expect(focus.payload?.data?.assistantActions?.some((action) => action.type === "map.focus_location")).toBeTruthy();
  const mapFocusAfter = await getCurrentItineraryFromUI(page);
  assertItineraryUnchanged(mapFocusBefore, mapFocusAfter);

  const lunchReply = await sendChatAndWaitForCompletion(page, "我第一天午餐吃什麼？", {
    chatTimeoutMs: 120_000,
  });
  expect(lunchReply.payload?.data?.assistantActions || []).toEqual([]);
  expect(lunchReply.lastAssistantMessage).toMatch(/午餐/u);

  const addLunch = await sendChatAndWaitForCompletion(page, "第一天幫我加入一個午餐，想吃拉麵", {
    waitForTripSync: true,
    chatTimeoutMs: 120_000,
  });
  const lunchAction = addLunch.payload?.data?.assistantActions?.find((action) => action.type === "itinerary.add_item");
  expect(lunchAction?.payload?.dayId).toBe("day-1");
  expect(lunchAction?.payload?.item?.category).toBe("restaurant");
  expect(`${lunchAction?.payload?.item?.title || ""} ${lunchAction?.payload?.item?.notes || ""}`).toMatch(/拉麵/u);

  const bootstrap = page.waitForResponse((res) => res.url().includes("/api/bootstrap") && res.ok(), { timeout: 40_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await bootstrap.catch(() => undefined);
  await dismissOnboardingIfVisible(page);
  if (/\/login/.test(page.url())) {
    await openChat(page);
  }

  const persistedAfterReload = await fetchPersistedTripFromBootstrap(page);
  expect(persistedAfterReload?.itinerary.find((day) => day.dayNumber === 1)?.items.some((item) => /拉麵/u.test(item.title))).toBeTruthy();
  const changedSummary = await sendChatAndWaitForCompletion(page, "剛剛我改了什麼？", {
    chatTimeoutMs: 120_000,
  });
  expect(changedSummary.lastAssistantMessage).toMatch(/目前|行程|新宿|拉麵|第二天/u);

  expect(consoleCapture.errors).toEqual([]);
  expect(networkCapture.failures).toEqual([]);
  consoleCapture.detach();
  networkCapture.detach();
  expect(beforeDelete.days.length).toBeGreaterThan(0);
});

test("3. 無 context 問答與不同使用者不會讀到上一個 itinerary", async ({ page }) => {
  test.setTimeout(180_000);
  await resetE2EData();
  await seedAuthUsers();
  await registerStructuredChatMock(page);
  await openChat(page, E2E_COLLABORATOR);

  const bootstrapPayload: BootstrapPayload = await fetchBootstrapPayload(page);
  expect(bootstrapPayload.trip).toBeNull();

  const reply = await sendChatAndWaitForCompletion(page, "我第二天去哪？", {
    chatTimeoutMs: 120_000,
  });
  expect(reply.lastAssistantMessage).toMatch(/目前還沒有可參考的行程|目前還沒有行程/u);
  expect(reply.payload?.data?.assistantActions || []).toEqual([]);
});

test("4. Mock 容錯：非 JSON / 錯誤 action 不應污染行程", async ({ page }) => {
  test.setTimeout(240_000);
  await resetE2EData();
  const { owner } = await seedAuthUsers();
  tokyoSeed = await seedTokyoPhase7ScenarioForUser(owner.id);
  await registerStructuredChatMock(page);
  const consoleCapture = captureConsoleErrors(page);

  await openChat(page);

  const before = await getCurrentItineraryFromUI(page);

  await page.getByTestId("chat-input").fill("幫我安排一個壞掉的非 JSON 回覆");
  await page.getByTestId("chat-send-button").click();
  await expect
    .poll(async () => ((await page.locator("body").innerText()) || "").includes("無法") || ((await page.locator("body").innerText()) || "").includes("失敗"), {
      timeout: 30_000,
    })
    .toBeTruthy();
  const afterMalformed = await getCurrentItineraryFromUI(page);
  assertItineraryUnchanged(before, afterMalformed);

  const invalidItem = await sendChatAndWaitForCompletion(page, "請回傳不存在的 itemId", {
    chatTimeoutMs: 120_000,
  });
  expect(invalidItem.payload?.data?.assistantActions?.length).toBe(1);
  const afterInvalidItem = await getCurrentItineraryFromUI(page);
  assertItineraryUnchanged(before, afterInvalidItem);

  const invalidDay = await sendChatAndWaitForCompletion(page, "請回傳錯誤的 dayId", {
    chatTimeoutMs: 120_000,
  });
  expect(invalidDay.payload?.data?.assistantActions?.length).toBe(1);
  const afterInvalidDay = await getCurrentItineraryFromUI(page);
  assertItineraryUnchanged(before, afterInvalidDay);

  const safety = await sendChatAndWaitForCompletion(page, "幫我把第一天加入 <script>alert(1)</script>", {
    chatTimeoutMs: 120_000,
  });
  expect(safety.lastAssistantMessage).toMatch(/無法直接加入|正常的景點|餐廳名稱/u);
  const persisted = await fetchPersistedTripFromBootstrap(page);
  const polluted = persisted?.itinerary.flatMap((day) => day.items).some((item) => /<script>|alert\(1\)/i.test(`${item.title} ${item.notes || ""}`));
  expect(polluted).toBe(false);

  expect(consoleCapture.errors.some((entry) => /<script>|alert\(1\)/i.test(entry.text))).toBe(false);
  consoleCapture.detach();
});
