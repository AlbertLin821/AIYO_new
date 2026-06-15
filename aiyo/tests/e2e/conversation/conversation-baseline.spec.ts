import { expect, test, type Route } from "@playwright/test";

import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "../helpers/auth";
import {
  ChatNetworkMonitor,
  fetchBootstrapPayload,
  fetchTripItineraryFromBootstrap,
  getCurrentItineraryFromUI,
  sendChatMessage,
} from "../helpers/chat";
import {
  cleanupConversationBaselineData,
  CONVERSATION_USER_A,
  CONVERSATION_USER_B,
  seedConversationBaselineData,
  type ConversationSeed,
} from "../../integration/conversation/fixtures";

let seed: ConversationSeed;

function chatPayload(input: {
  content: string;
  assistantActions?: unknown[];
  mode?: string;
}) {
  const assistantActions = input.assistantActions || [];
  return {
    success: true,
    data: {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: input.content,
        timestamp: "10:00",
        responseType: "text_message",
        assistantActions,
        proposedChanges: [],
        metadata: input.mode ? { chatPlanningMode: input.mode } : undefined,
      },
      assistantActions,
      proposedChanges: [],
      travelAgentDecision: {
        mode: assistantActions.length ? "modify_itinerary" : "answer_trip_question",
        shouldSearch: false,
        requiredSearchProviders: [],
        shouldGenerateItinerary: false,
        shouldModifyItinerary: assistantActions.length > 0,
        shouldAskFollowUp: false,
        missingRequirements: [],
        debugReason: "conversation baseline harness",
      },
    },
  };
}

async function fulfillConversationHarness(route: Route) {
  const body = route.request().postDataJSON() as {
    displayMessage?: string;
    instruction?: string;
    message?: string;
    context?: {
      itinerary?: Array<{
        dayNumber: number;
        items: Array<{ id: string; title: string; type?: string; time?: string }>;
      }>;
    };
  };
  const message = String(body.message || body.instruction || body.displayMessage || "").trim();
  const day2 = body.context?.itinerary?.find((day) => day.dayNumber === 2);

  if (message === "在第二天加入淺草寺和晴空塔。") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        chatPayload({
          content: "已在第二天加入淺草寺和東京晴空塔。",
          mode: "modify_itinerary",
          assistantActions: [
            {
              type: "itinerary.add_item",
              payload: {
                dayId: "day-2",
                item: {
                  title: "淺草寺",
                  location: "淺草寺",
                  startTime: "16:30",
                  category: "attraction",
                  notes: "傳統寺廟，符合偏好。",
                  lat: 35.7148,
                  lng: 139.7967,
                  source: "assistant",
                },
              },
            },
            {
              type: "itinerary.add_item",
              payload: {
                dayId: "day-2",
                item: {
                  title: "東京晴空塔",
                  location: "東京晴空塔",
                  startTime: "18:00",
                  category: "attraction",
                  notes: "接在淺草寺後，動線相近。",
                  lat: 35.7101,
                  lng: 139.8107,
                  source: "assistant",
                },
              },
            },
          ],
        }),
      ),
    });
    return;
  }

  if (message === "把第二天的晴空塔改到下午三點。") {
    const skytree = day2?.items.find((item) => /晴空塔/.test(item.title));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        skytree
          ? chatPayload({
              content: "已把第二天的東京晴空塔改到下午三點。",
              mode: "modify_itinerary",
              assistantActions: [
                {
                  type: "itinerary.update_item",
                  payload: {
                    dayId: "day-2",
                    itemId: skytree.id,
                    patch: { startTime: "15:00" },
                  },
                },
              ],
            })
          : chatPayload({ content: "我找不到第二天的晴空塔，請先確認要修改哪一個項目。" }),
      ),
    });
    return;
  }

  if (message === "第二天全部清空。") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        chatPayload({
          content: "這會清空第二天全部安排，影響較大。請再明確確認要清空第二天，我再執行。",
        }),
      ),
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(chatPayload({ content: "這個 baseline harness 尚未覆蓋該訊息。" })),
  });
}

test.beforeEach(async () => {
  seed = await seedConversationBaselineData();
});

test.afterEach(async () => {
  await cleanupConversationBaselineData();
});

async function openUserAChat(page: import("@playwright/test").Page) {
  await page.route("**/api/ai/chat**", fulfillConversationHarness);
  await page.route("**/api/chat/message**", fulfillConversationHarness);
  await page.route("**/api/trip/revise**", fulfillConversationHarness);
  await loginAs(page, CONVERSATION_USER_A, "/chat");
  await waitForAuthenticatedSession(page, CONVERSATION_USER_A.email);
  await dismissOnboardingIfVisible(page);
  await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 40_000 });
}

test("multi-add action updates chat payload, UI itinerary, DB/bootstrap, map markers, and survives reload", async ({ page }) => {
  test.setTimeout(180_000);
  await openUserAChat(page);
  const monitor = new ChatNetworkMonitor();
  monitor.attach(page);

  const add = await sendChatMessage(page, "在第二天加入淺草寺和晴空塔。", { waitForTripSync: true });
  const last = monitor.lastChatPayload() || add.payload;
  expect(last?.data?.assistantActions?.map((action) => action.type)).toEqual([
    "itinerary.add_item",
    "itinerary.add_item",
  ]);

  const ui = await getCurrentItineraryFromUI(page);
  const day2 = ui.days.find((day) => day.dayNumber === 2);
  expect(day2?.items.map((item) => item.title).join(" ")).toContain("淺草寺");
  expect(day2?.items.map((item) => item.title).join(" ")).toContain("東京晴空塔");

  const bootstrapItinerary = await fetchTripItineraryFromBootstrap(page);
  const persistedDay2Titles = bootstrapItinerary.find((day) => day.dayNumber === 2)?.items.map((item) => item.title) || [];
  expect(persistedDay2Titles).toEqual(expect.arrayContaining(["明治神宮", "澀谷十字路口", "淺草寺", "東京晴空塔"]));

  await page.goto("/map");
  await dismissOnboardingIfVisible(page);
  await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId("map-view").getByRole("button", { name: "淺草寺" })).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId("map-view").getByRole("button", { name: "東京晴空塔" })).toHaveCount(1, { timeout: 20_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissOnboardingIfVisible(page);
  const reloaded = await fetchBootstrapPayload(page);
  const reloadedTitles = reloaded.trip?.itinerary.flatMap((day) => day.items.map((item) => item.title)) || [];
  expect(reloadedTitles).toEqual(expect.arrayContaining(["淺草寺", "東京晴空塔"]));
});

test("destructive ambiguous operation asks for confirmation and leaves UI/DB unchanged", async ({ page }) => {
  test.setTimeout(120_000);
  await openUserAChat(page);
  const before = await fetchTripItineraryFromBootstrap(page);

  const response = await sendChatMessage(page, "第二天全部清空。", { waitForTripSync: false });
  expect(response.payload?.data?.assistantActions || []).toEqual([]);
  await expect(page.getByTestId("chat-message-ai").last()).toContainText(/確認|清空第二天/);

  const after = await fetchTripItineraryFromBootstrap(page);
  expect(after).toEqual(before);
});

test("User B cannot see User A conversation fixture or current trip after fresh login", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAs(page, CONVERSATION_USER_B, "/chat");
  await waitForAuthenticatedSession(page, CONVERSATION_USER_B.email);
  await dismissOnboardingIfVisible(page);

  const bootstrap = await fetchBootstrapPayload(page);
  const serialized = JSON.stringify(bootstrap);
  expect(serialized).not.toContain(seed.currentTripId);
  expect(serialized).not.toContain("東京四日遊");
  expect(serialized).not.toContain("淺草寺");
  expect(serialized).not.toContain("明治神宮");

  await page.goto("/itinerary");
  await dismissOnboardingIfVisible(page);
  await expect(page.getByText("共 0 個行程")).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText("東京四日遊")).toHaveCount(0);
  await expect(page.getByText("淺草寺")).toHaveCount(0);
  await expect(page.getByText("明治神宮")).toHaveCount(0);
});
