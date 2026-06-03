import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "./helpers/auth";
import {
  fetchPersistedTripFromBootstrap,
  sendChatAndWaitForCompletion,
} from "./helpers/chat";
import {
  clearE2EOwnerLiveAiState,
  E2E_OWNER,
  resetE2EData,
  resetE2EOwnerPlanningProfile,
  seedAuthUsers,
  seedTokyoPhase7ScenarioForUser,
  type Phase7TokyoSeed,
} from "./helpers/db";
import {
  assertItineraryStructure,
  assertNoApiKeyLeak,
  completeLiveTripPlanningFlow,
  ensureLiveAiAvailability,
  extractAssistantActions,
  extractMutationAssistantActions,
  isLiveAiEnvEnabled,
  recordLiveAiOutcome,
  resolveAiReplyText,
  skipIfLiveAiUnavailable,
  snapshotItinerary,
} from "./helpers/liveAi";

test.describe.configure({ mode: "serial" });

const liveState = {
  liveAvailable: false,
  skipReason: "E2E_LIVE_AI 未啟用",
};

let tokyoSeed: Phase7TokyoSeed | undefined;

function liveSkip() {
  const gate = skipIfLiveAiUnavailable(liveState.liveAvailable, liveState.skipReason);
  test.skip(gate.skip, gate.reason);
}

async function openLiveChat(page: import("@playwright/test").Page) {
  await loginAs(page, E2E_OWNER, "/chat");
  await dismissOnboardingIfVisible(page);
  await waitForAuthenticatedSession(page, E2E_OWNER.email);
  await page.request.get("/api/bootstrap").catch(() => undefined);
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissOnboardingIfVisible(page);
  await waitForAuthenticatedSession(page, E2E_OWNER.email);
  await ensureLiveAiAvailability(page, liveState);
}

test.describe("Live AI itinerary smoke", () => {
  test.beforeAll(async () => {
    if (!isLiveAiEnvEnabled()) {
      return;
    }
    await resetE2EData();
    await seedAuthUsers();
  });

  test.afterAll(async () => {
    if (isLiveAiEnvEnabled()) {
      await resetE2EData();
    }
  });

  test("1. 初次生成東京三天兩夜行程", async ({ page }, testInfo) => {
    test.setTimeout(720_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    await clearE2EOwnerLiveAiState();
    await resetE2EOwnerPlanningProfile();
    await openLiveChat(page);
    liveSkip();

    let replyPreview = "";
    let passed = true;
    let failureReason: string | undefined;
    try {
      const { lastPayload, days } = await completeLiveTripPlanningFlow(
        page,
        "幫我安排東京三天兩夜自由行，我喜歡美食、逛街和城市散步，交通以大眾運輸為主，預算中等。",
        {
          chatTimeoutMs: 240_000,
          structuredTravelPlanning: true,
          destination: "東京",
        },
      );
      replyPreview = await resolveAiReplyText(page, lastPayload);
      assertNoApiKeyLeak(replyPreview);
      assertItineraryStructure(days, 3);
      expect(lastPayload?.data?.reply?.responseType === "travel_plan" || days.length >= 3).toBeTruthy();
    } catch (error) {
      passed = false;
      failureReason = error instanceof Error ? error.message : String(error);
      replyPreview = await page.getByTestId("chat-message-ai").last().innerText().catch(() => "");
      throw error;
    } finally {
      recordLiveAiOutcome(testInfo, {
        scenario: "live plan tokyo 3d2n",
        passed,
        replyPreview,
        failureReason,
      });
    }
  });

  test("2. 詢問第二天有哪些地方不應修改行程", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    if (!tokyoSeed) {
      await resetE2EData();
      const { owner } = await seedAuthUsers();
      tokyoSeed = await seedTokyoPhase7ScenarioForUser(owner.id);
    }
    await openLiveChat(page);
    liveSkip();

    const before = await snapshotItinerary(page);
    const day2Titles = before.days.find((day) => day.dayNumber === 2)?.items.map((item) => item.title) || [];
    const { payload } = await sendChatAndWaitForCompletion(page, "第二天主要會去哪幾個地方？", {
      structuredTravelPlanning: true,
      chatTimeoutMs: 180_000,
    });
    const reply = await resolveAiReplyText(page, payload);
    expect(day2Titles.some((title) => reply.includes(title))).toBeTruthy();
    expect(extractMutationAssistantActions(payload).length).toBe(0);
    const after = await snapshotItinerary(page);
    expect(after.titles).toEqual(before.titles);

    recordLiveAiOutcome(testInfo, {
      scenario: "live q&a day2 no mutation",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });

  test("3. 把第二天其中一個景點改成新宿", async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    if (!tokyoSeed) {
      await resetE2EData();
      const { owner } = await seedAuthUsers();
      tokyoSeed = await seedTokyoPhase7ScenarioForUser(owner.id);
    }
    await openLiveChat(page);
    liveSkip();

    const beforeTrip = await fetchPersistedTripFromBootstrap(page);
    const target = beforeTrip?.itinerary.find((day) => day.dayNumber === 2)?.items[0];
    expect(target).toBeTruthy();
    const { payload } = await sendChatAndWaitForCompletion(page, `把第二天的 ${target?.title} 改成新宿`, {
      structuredTravelPlanning: true,
      waitForTripSync: true,
      chatTimeoutMs: 180_000,
    });
    const reply = await resolveAiReplyText(page, payload);
    const updateAction = extractAssistantActions(payload).find((action) => action.type === "itinerary.update_item");
    expect(updateAction).toBeTruthy();
    expect(updateAction?.payload?.dayId).toBe("day-2");
    expect(updateAction?.payload?.itemId).toBe(target?.id);
    const afterTrip = await fetchPersistedTripFromBootstrap(page);
    const updated = afterTrip?.itinerary.find((day) => day.dayNumber === 2)?.items.find((item) => item.id === target?.id);
    expect(`${updated?.title || ""} ${updated?.location?.name || ""}`).toMatch(/新宿/u);

    recordLiveAiOutcome(testInfo, {
      scenario: "live replace with shinjuku",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });

  test("4. 新增第二天晴空塔", async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    if (!tokyoSeed) {
      await resetE2EData();
      const { owner } = await seedAuthUsers();
      tokyoSeed = await seedTokyoPhase7ScenarioForUser(owner.id);
    }
    await openLiveChat(page);
    liveSkip();

    const before = await fetchPersistedTripFromBootstrap(page);
    const beforeCount = before?.itinerary.find((day) => day.dayNumber === 2)?.items.length || 0;
    const { payload } = await sendChatAndWaitForCompletion(page, "第二天下午幫我加一個晴空塔，安排在逛街後面。", {
      structuredTravelPlanning: true,
      waitForTripSync: true,
      chatTimeoutMs: 180_000,
    });
    const reply = await resolveAiReplyText(page, payload);
    const addAction = extractAssistantActions(payload).find((action) => action.type === "itinerary.add_item");
    expect(addAction).toBeTruthy();
    expect(addAction?.payload?.dayId).toBe("day-2");
    const after = await fetchPersistedTripFromBootstrap(page);
    const day2 = after?.itinerary.find((day) => day.dayNumber === 2);
    expect(day2?.items.length).toBeGreaterThanOrEqual(beforeCount + 1);
    expect(day2?.items.some((item) => /晴空塔|Skytree/i.test(`${item.title} ${item.location?.name || ""}`))).toBeTruthy();

    recordLiveAiOutcome(testInfo, {
      scenario: "live add skytree",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });

  test("5. 刪除第二天晴空塔", async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    if (!tokyoSeed) {
      await resetE2EData();
      const { owner } = await seedAuthUsers();
      tokyoSeed = await seedTokyoPhase7ScenarioForUser(owner.id);
    }
    await openLiveChat(page);
    liveSkip();

    const before = await fetchPersistedTripFromBootstrap(page);
    const skytree = before?.itinerary
      .find((day) => day.dayNumber === 2)
      ?.items.find((item) => /晴空塔|Skytree/i.test(`${item.title} ${item.location?.name || ""}`));
    test.skip(!skytree, "目前第二天沒有晴空塔可刪除");

    const { payload } = await sendChatAndWaitForCompletion(page, "刪掉第二天的晴空塔", {
      structuredTravelPlanning: true,
      waitForTripSync: true,
      chatTimeoutMs: 180_000,
    });
    const reply = await resolveAiReplyText(page, payload);
    const removeAction = extractAssistantActions(payload).find((action) => action.type === "itinerary.remove_item");
    expect(removeAction).toBeTruthy();
    const after = await fetchPersistedTripFromBootstrap(page);
    const day2HasSkytree = after?.itinerary
      .find((day) => day.dayNumber === 2)
      ?.items.some((item) => /晴空塔|Skytree/i.test(`${item.title} ${item.location?.name || ""}`));
    expect(day2HasSkytree).toBe(false);

    recordLiveAiOutcome(testInfo, {
      scenario: "live remove skytree",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });
});
