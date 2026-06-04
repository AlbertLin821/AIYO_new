import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "./helpers/auth";
import {
  ChatNetworkMonitor,
  expectDay2Order,
  expectItineraryActivity,
  fetchTripItineraryFromBootstrap,
  sendChatMessage,
} from "./helpers/chat";
import {
  E2E_OWNER,
  resetE2EData,
  seedAuthUsers,
  seedTokyoPhase7ScenarioForUser,
  type Phase7TokyoSeed,
} from "./helpers/db";
import { isLiveAiAvailable, registerPhase7ChatHarness } from "./helpers/phase7ChatHarness";
import { openItineraryEditor } from "./helpers/itinerary";

test.describe.configure({ mode: "serial" });

let tokyoSeed: Phase7TokyoSeed;
let useLiveAi = false;

test.beforeAll(async () => {
  await resetE2EData();
  const { owner } = await seedAuthUsers();
  tokyoSeed = await seedTokyoPhase7ScenarioForUser(owner.id);
});

test.afterAll(async () => {
  await resetE2EData();
});

async function openChatWithHarness(page: import("@playwright/test").Page) {
  if (process.env.E2E_LIVE_AI !== "1") {
    await registerPhase7ChatHarness(page, tokyoSeed);
    useLiveAi = false;
  } else {
    useLiveAi = false;
  }
  await loginAs(page, E2E_OWNER, "/chat");
  await dismissOnboardingIfVisible(page);
  await waitForAuthenticatedSession(page, E2E_OWNER.email);
  if (process.env.E2E_LIVE_AI === "1") {
    useLiveAi = await isLiveAiAvailable(page);
    if (!useLiveAi) {
      await registerPhase7ChatHarness(page, tokyoSeed);
    }
  }
}

async function returnToChat(page: import("@playwright/test").Page) {
  if (process.env.E2E_LIVE_AI !== "1") {
    await registerPhase7ChatHarness(page, tokyoSeed);
  }
  await page.goto("/chat");
  await dismissOnboardingIfVisible(page);
  await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 40_000 });
}

test.describe("Phase 7 travel agent browser flow", () => {
  test("A. 自然聊天：你好", async ({ page }) => {
    test.setTimeout(120_000);
    await openChatWithHarness(page);
    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    await sendChatMessage(page, "你好");
    await expect(page.getByTestId("chat-message-ai").last()).toContainText(/你好|旅遊助理/);
    const last = monitor.lastChatPayload();
    if (last?.data?.reply?.content) {
      expect(last.data.assistantActions?.length ?? 0).toBe(0);
      expect(last.data.itinerarySuggestion).toBeFalsy();
    }
  });

  test("B. 偏好確認：東京三天", async ({ page }) => {
    test.setTimeout(120_000);
    await openChatWithHarness(page);
    await expect(page.getByText("偵測到你先前使用過以下旅遊設定")).toHaveCount(0);
    await sendChatMessage(page, "我想去東京玩三天");
    const reply = page.getByTestId("chat-message-ai").last();
    await expect(reply).toContainText(/偏好|中等|預算|美食|購物|沿用/);
    await expect(page.getByTestId("preference-reuse-panel")).toBeVisible();
    await expect(page.getByTestId("preference-reuse-accept")).toBeVisible();
    await expect(reply).not.toContainText(/第 1 天：/);
  });

  test("C. 套用偏好並準備生成行程", async ({ page }) => {
    test.setTimeout(120_000);
    await openChatWithHarness(page);
    await sendChatMessage(page, "我想去東京玩三天");
    await expect(page.getByTestId("preference-reuse-panel")).toBeVisible();
    await page.getByTestId("preference-reuse-accept").click();
    const reply = page.getByTestId("chat-message-ai").last();
    await expect(reply).toContainText(/沿用|東京|偏好|輕鬆|中等/);
  });

  test("C2. 嘉義四人沿用偏好後不再問人數", async ({ page }) => {
    test.setTimeout(120_000);
    await openChatWithHarness(page);
    await sendChatMessage(page, "我想要去嘉義三天兩夜總共四個人去玩幫我規劃一下行程");
    await expect(page.getByTestId("preference-reuse-panel")).toBeVisible();
    await page.getByTestId("preference-reuse-accept").click();
    const reply = page.getByTestId("chat-message-ai").last();
    await expect(reply).toContainText(/出發|日期|嘉義/);
    await expect(reply).not.toContainText(/幾個人同行/);
  });

  test("D. 條件式搜尋：晴空塔營業時間", async ({ page }) => {
    test.setTimeout(120_000);
    await openChatWithHarness(page);
    test.skip(useLiveAi && !process.env.SERPER_API_KEY && !process.env.TAVILY_API_KEY, "Live AI 搜尋需 SERPER 或 TAVILY API key");

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);
    const { payload: searchPayload } = await sendChatMessage(page, "東京晴空塔今天營業到幾點");
    const last = monitor.lastChatPayload() || searchPayload;
    if (useLiveAi) {
      const steps = last?.data?.reply?.statusSteps || [];
      const webProviders = steps.map((step) => step.provider).filter(Boolean);
      if (webProviders.length) {
        expect(webProviders.every((p) => p === "serper" || p === "tavily")).toBeTruthy();
      }
    } else {
      expect(last?.data?.reply?.statusSteps?.some((step) => step.provider === "serper")).toBeTruthy();
    }
    await expect(page.getByTestId("chat-message-ai").last()).toContainText(/營業|22|晴空塔/);
  });

  test("E. 一般旅遊問題不強制搜尋", async ({ page }) => {
    test.setTimeout(120_000);
    await openChatWithHarness(page);
    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);
    const { payload: generalPayload } = await sendChatMessage(page, "你覺得東京適合第一次自由行嗎？");
    const last = monitor.lastChatPayload() || generalPayload;
    expect(last?.data?.assistantActions?.length ?? 0).toBe(0);
    await expect(page.getByTestId("chat-message-ai").last()).toContainText(/東京|自由行/);
  });

  test("F–H. AssistantAction 修改、新增與排序", async ({ page }) => {
    test.setTimeout(300_000);
    await openChatWithHarness(page);
    test.skip(useLiveAi, "行程修改 UI 整合測試使用 scenario harness");

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const { payload: updatePayload } = await sendChatMessage(page, "幫我把第二天的秋葉原改成晴空塔", {
      waitForTripSync: true,
    });
    const lastUpdate = monitor.lastChatPayload() || updatePayload;
    expect(lastUpdate?.data?.assistantActions?.some((action) => action.type === "itinerary.update_item")).toBeTruthy();
    await expectItineraryActivity(page, "東京晴空塔");
    await expectItineraryActivity(page, "秋葉原", false);

    await page.goto("/map");
    await dismissOnboardingIfVisible(page);
    await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("map-view").getByRole("button", { name: "秋葉原" })).toHaveCount(0);
    await expect(page.getByTestId("map-view").getByRole("button", { name: /晴空塔/ })).toHaveCount(1, {
      timeout: 20_000,
    });

    await returnToChat(page);
    await sendChatMessage(page, "幫我把晴空塔加到第一天下午", { waitForTripSync: true });
    await expectItineraryActivity(page, "東京晴空塔");

    await returnToChat(page);
    const { payload: reorderPayload } = await sendChatMessage(page, "把第二天順序改成銀座、晴空塔", {
      waitForTripSync: true,
    });
    const lastReorder = monitor.lastChatPayload() || reorderPayload;
    expect(lastReorder?.data?.assistantActions?.some((action) => action.type === "itinerary.reorder_items")).toBeTruthy();
    await expectDay2Order(page, ["銀座", "晴空塔"]);
  });

  test("I. 地圖定位：清水寺", async ({ page }) => {
    test.setTimeout(120_000);
    await openChatWithHarness(page);
    test.skip(useLiveAi, "地圖 focus 整合測試使用 scenario harness");

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);
    const countBefore = await page.goto("/itinerary").then(async () => {
      await openItineraryEditor(page);
      return page.getByTestId("activity-card").count();
    });

    await returnToChat(page);
    await sendChatMessage(page, "地圖幫我定位到清水寺");
    lastAssistantHasMapFocus(monitor);
    await expect(page.getByTestId("chat-message-ai").last()).toContainText(/清水寺|地圖/);

    await page.goto("/itinerary");
    await expect(page.getByTestId("itinerary-editor")).toBeVisible({ timeout: 40_000 });
    const countAfter = await page.getByTestId("activity-card").count();
    expect(countAfter).toBe(countBefore);
    await expectItineraryActivity(page, "清水寺", false);
  });

  test("J. 保存與重新整理", async ({ page }) => {
    test.setTimeout(300_000);
    await openChatWithHarness(page);
    test.skip(useLiveAi, "持久化驗證使用 scenario harness");

    await sendChatMessage(page, "幫我把第二天的秋葉原改成晴空塔", { waitForTripSync: true });
    await sendChatMessage(page, "幫我把晴空塔加到第一天下午", { waitForTripSync: true });

    const bootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 40_000 },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await bootstrap.catch(() => {});
    if (/\/login/.test(page.url())) {
      await loginAs(page, E2E_OWNER, "/itinerary");
      await dismissOnboardingIfVisible(page);
    } else {
      await dismissOnboardingIfVisible(page);
    }

    await expectItineraryActivity(page, "東京晴空塔");
    await expectItineraryActivity(page, "秋葉原", false);

    const itinerary = await fetchTripItineraryFromBootstrap(page);
    const titles = itinerary.flatMap((day) => day.items.map((item) => item.title));
    expect(titles.filter((title) => title.includes("晴空塔")).length).toBeGreaterThanOrEqual(1);
    expect(titles.some((title) => title === "秋葉原")).toBe(false);

    const skytreeCoords = await page.evaluate(async () => {
      const response = await fetch("/api/bootstrap", { cache: "no-store", credentials: "same-origin" });
      const json = (await response.json()) as {
        data?: {
          trip?: {
            itinerary?: Array<{
              items: Array<{ title: string; location?: { lat?: number; lng?: number } }>;
            }>;
          };
        };
      };
      const item = (json.data?.trip?.itinerary || [])
        .flatMap((day) => day.items)
        .find((candidate) => candidate.title.includes("晴空塔"));
      return item?.location;
    });
    expect(skytreeCoords?.lat).toBeCloseTo(35.7101, 3);
    expect(skytreeCoords?.lng).toBeCloseTo(139.8107, 3);
  });

  test("K. Geocode mock：非東京地點查詢可回傳座標", async ({ page }) => {
    test.setTimeout(60_000);
    await openChatWithHarness(page);
    test.skip(useLiveAi, "Geocode mock 整合測試使用 scenario harness");

    const result = await page.evaluate(async () => {
      const response = await fetch("/api/places/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "聖水洞",
          destinationHint: "Seoul",
          purpose: "map_focus",
        }),
      });
      return response.json();
    });

    expect(result.success).toBe(true);
    expect(result.data.place.lat).toBeCloseTo(37.5447, 3);
    expect(result.data.place.lng).toBeCloseTo(127.0559, 3);
  });
});

function lastAssistantHasMapFocus(monitor: ChatNetworkMonitor) {
  const last = monitor.lastChatPayload();
  expect(last?.data?.assistantActions?.some((action) => action.type === "map.focus_location")).toBeTruthy();
}
