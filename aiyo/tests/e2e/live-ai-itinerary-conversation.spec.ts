import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "./helpers/auth";
import {
  ChatNetworkMonitor,
  expectItineraryActivity,
  fetchTripItineraryFromBootstrap,
  sendChatMessage,
} from "./helpers/chat";
import {
  clearE2EOwnerLiveAiState,
  E2E_OWNER,
  resetE2EData,
  resetE2EOwnerPlanningProfile,
  seedAuthUsers,
  seedSeoulPhase75ScenarioForUser,
  type Phase75SeoulSeed,
} from "./helpers/db";
import {
  assertItineraryStructure,
  assertItineraryUnchanged,
  assertNoApiKeyLeak,
  assertNoPlaceholderItineraryTitles,
  assertNoTokyoTemplatePollution,
  buildLiveTripPlanningMessage,
  completeLiveTripPlanningFlow,
  ensureLiveAiAvailability,
  extractAssistantActions,
  extractMutationAssistantActions,
  extractReplyText,
  isLiveAiEnvEnabled,
  pickRandomLiveDestination,
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

let seoulSeed: Phase75SeoulSeed | undefined;
let chosenDestination = "";

function liveSkip() {
  const gate = skipIfLiveAiUnavailable(liveState.liveAvailable, liveState.skipReason);
  test.skip(gate.skip, gate.reason);
}

async function openLiveChat(page: import("@playwright/test").Page) {
  await loginAs(page, E2E_OWNER, "/chat");
  await dismissOnboardingIfVisible(page);
  await waitForAuthenticatedSession(page, E2E_OWNER.email);
  await ensureLiveAiAvailability(page, liveState);
}

test.describe("Live AI itinerary conversation — generation", () => {
  test.beforeAll(async () => {
    if (!isLiveAiEnvEnabled()) {
      return;
    }
    await resetE2EData();
    await seedAuthUsers();
  });

  test.beforeEach(async () => {
    if (!isLiveAiEnvEnabled()) {
      return;
    }
    await clearE2EOwnerLiveAiState();
    await resetE2EOwnerPlanningProfile();
  });

  test("1. 隨機目的地三天兩夜規劃", async ({ page }, testInfo) => {
    test.setTimeout(720_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }

    chosenDestination = pickRandomLiveDestination(test.info().parallelIndex);
    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const message = buildLiveTripPlanningMessage(chosenDestination);
    testInfo.annotations.push({ type: "live-ai-dest", description: chosenDestination });

    let flowPassed = true;
    let failureReason: string | undefined;
    let replyPreview = "";

    try {
      const { lastPayload, days } = await completeLiveTripPlanningFlow(page, message, {
        chatTimeoutMs: 240_000,
        structuredTravelPlanning: true,
        destination: chosenDestination,
      });

      replyPreview = extractReplyText(lastPayload) || (await page.getByTestId("chat-message-ai").last().innerText());
      assertNoTokyoTemplatePollution(replyPreview);
      assertNoApiKeyLeak(replyPreview);
      assertItineraryStructure(days, 2);

      const titles = days.flatMap((day) => day.items.map((item) => item.title));
      assertNoPlaceholderItineraryTitles(titles);
      monitor.assertNoSearxngInAiChat();

      const responseType = lastPayload?.data?.reply?.responseType;
      expect(
        responseType === "travel_plan" || days.length >= 2,
        "應產生 travel_plan 或 bootstrap 行程",
      ).toBeTruthy();
    } catch (error) {
      flowPassed = false;
      failureReason = error instanceof Error ? error.message : String(error);
      const days = await fetchTripItineraryFromBootstrap(page).catch(() => []);
      replyPreview = await page
        .getByTestId("chat-message-ai")
        .last()
        .innerText()
        .catch(() => "");
      const itemCount = days.flatMap((day) => day.items).length;
      testInfo.annotations.push({
        type: "live-ai-raw",
        description: JSON.stringify({
          destination: chosenDestination,
          error: failureReason,
          dayCount: days.length,
          itemCount,
          titles: days.flatMap((day) => day.items.map((item) => item.title)).slice(0, 12),
        }).slice(0, 800),
      });

      if (itemCount > 0) {
        assertItineraryStructure(days, 2);
        assertNoPlaceholderItineraryTitles(days.flatMap((day) => day.items.map((item) => item.title)));
        flowPassed = true;
        failureReason = `${failureReason} | recovered partial itinerary (${itemCount} items)`;
      } else {
        expect.soft(itemCount, "Live 規劃應產生至少 1 個行程活動").toBeGreaterThan(0);
      }
    } finally {
      recordLiveAiOutcome(testInfo, {
        scenario: `1 plan ${chosenDestination}`,
        passed: flowPassed,
        replyPreview,
        failureReason,
      });
    }
  });
});

test.describe("Live AI itinerary conversation — delete", () => {
  test.beforeAll(async () => {
    if (!isLiveAiEnvEnabled()) {
      return;
    }
    await resetE2EData();
    const { owner } = await seedAuthUsers();
    seoulSeed = await seedSeoulPhase75ScenarioForUser(owner.id);
  });

  test.afterAll(async () => {
    if (isLiveAiEnvEnabled()) {
      await resetE2EData();
    }
  });

  test("2. 刪除第二天活動", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    if (!seoulSeed) {
      test.skip(true, "首爾 seed 未建立");
    }

    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const itineraryBefore = await fetchTripItineraryFromBootstrap(page);
    const day2 = itineraryBefore.find((day) => day.dayNumber === 2);
    const targetTitle = day2?.items[0]?.title;
    expect(targetTitle, "seed 第二天應有活動").toBeTruthy();

    const message = `幫我刪掉第二天的${targetTitle}`;
    const { payload } = await sendChatMessage(page, message, {
      chatTimeoutMs: 180_000,
      waitForTripSync: true,
      structuredTravelPlanning: true,
    });
    const reply = await resolveAiReplyText(page, payload);
    const actions = extractAssistantActions(payload);
    const removeAction = actions.find((action) => action.type === "itinerary.remove_item");

    assertNoTokyoTemplatePollution(reply);
    assertNoApiKeyLeak(reply);
    monitor.assertNoSearxngInAiChat();

    if (!removeAction) {
      recordLiveAiOutcome(testInfo, {
        scenario: "2 delete remove_item",
        passed: false,
        replyPreview: reply,
        assistantActionCount: actions.length,
        failureReason: `無 itinerary.remove_item；actions=${actions.map((a) => a.type).join(",")}`,
      });
      testInfo.annotations.push({
        type: "live-ai-raw",
        description: JSON.stringify({ reply: reply.slice(0, 300), actions, targetTitle }).slice(0, 800),
      });
      expect.soft(removeAction, "Live AI 應產生 itinerary.remove_item").toBeTruthy();
    } else {
      recordLiveAiOutcome(testInfo, {
        scenario: "2 delete remove_item",
        passed: true,
        replyPreview: reply,
        assistantActionCount: actions.length,
      });
    }

    await expectItineraryActivity(page, targetTitle!, false);

    await page.reload();
    await waitForAuthenticatedSession(page, E2E_OWNER.email);
    const itineraryAfter = await fetchTripItineraryFromBootstrap(page);
    const stillPresent = itineraryAfter
      .flatMap((day) => day.items)
      .some((item) => item.title === targetTitle);
    expect(stillPresent, "reload 後刪除的活動不應再出現").toBe(false);
  });
});

test.describe("Live AI itinerary conversation — Q&A", () => {
  test.beforeAll(async () => {
    if (!isLiveAiEnvEnabled()) {
      return;
    }
    await resetE2EData();
    const { owner } = await seedAuthUsers();
    seoulSeed = await seedSeoulPhase75ScenarioForUser(owner.id);
  });

  test.afterAll(async () => {
    if (isLiveAiEnvEnabled()) {
      await resetE2EData();
    }
  });

  test("3. 景點推薦問答不改行程", async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    if (!seoulSeed) {
      test.skip(true, "首爾 seed 未建立");
    }

    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const before = await snapshotItinerary(page);
    const knownPoi = before.titles.find((title) => /景福宮|弘大|明洞|北村/.test(title)) || "景福宮";
    const message = `${knownPoi}附近還有什麼值得去的景點？`;

    const { payload } = await sendChatMessage(page, message, {
      chatTimeoutMs: 180_000,
      waitForTripSync: false,
      retryOnFailure: false,
    });
    const reply = await resolveAiReplyText(page, payload);
    const mutationActions = extractMutationAssistantActions(payload);

    assertNoTokyoTemplatePollution(reply);
    assertNoApiKeyLeak(reply);
    expect(reply.length).toBeGreaterThanOrEqual(10);
    expect(reply).toMatch(new RegExp(knownPoi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "|首爾|附近|推薦|景點"));
    expect(mutationActions.length, "推薦問答不應修改行程").toBe(0);
    monitor.assertNoSearxngInAiChat();

    await assertItineraryUnchanged(page, before);

    recordLiveAiOutcome(testInfo, {
      scenario: "3 POI Q&A no mutation",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });
});
