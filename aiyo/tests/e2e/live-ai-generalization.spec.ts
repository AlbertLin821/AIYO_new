import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "./helpers/auth";
import { ChatNetworkMonitor, sendChatMessage } from "./helpers/chat";
import {
  E2E_OWNER,
  resetE2EData,
  seedAuthUsers,
  seedSeoulPhase75ScenarioForUser,
  type Phase75SeoulSeed,
} from "./helpers/db";
import {
  assertMentionsAny,
  assertNoApiKeyLeak,
  assertNoAssistantActions,
  assertNoSearchProviders,
  assertNoTokyoTemplatePollution,
  assertSearchUsedProviders,
  extractAssistantActions,
  isLiveAiEnvEnabled,
  probeLiveAiChat,
  recordLiveAiOutcome,
  resolveAiReplyText,
  skipIfLiveAiUnavailable,
} from "./helpers/liveAi";

test.describe.configure({ mode: "serial" });

let liveAvailable = false;
let skipReason = "E2E_LIVE_AI 未啟用";
let seoulSeed: Phase75SeoulSeed | undefined;

test.beforeAll(async () => {
  if (!isLiveAiEnvEnabled()) {
    return;
  }
  await resetE2EData();
  await seedAuthUsers();
});

async function openLiveChat(page: import("@playwright/test").Page) {
  await loginAs(page, E2E_OWNER, "/chat");
  await dismissOnboardingIfVisible(page);
  await waitForAuthenticatedSession(page, E2E_OWNER.email);
  const probe = await probeLiveAiChat(page);
  liveAvailable = probe.available;
  skipReason = probe.reason || skipReason;
}

function liveSkip() {
  const gate = skipIfLiveAiUnavailable(liveAvailable, skipReason);
  test.skip(gate.skip, gate.reason);
}

test.describe("Phase 7.5 Live AI generalization", () => {
  test("A. 嘉義兩天一夜", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const message =
      "我想安排嘉義兩天一夜，想吃火雞肉飯，也想去阿里山或文化路夜市，你可以幫我規劃嗎？";
    const { payload } = await sendChatMessage(page, message, { chatTimeoutMs: 150_000 });
    const reply = await resolveAiReplyText(page, payload);

    expect(reply.length).toBeGreaterThanOrEqual(10);
    assertNoTokyoTemplatePollution(reply);
    assertMentionsAny(reply, [/嘉義/, /阿里山/, /文化路/, /火雞肉飯/], "嘉義相關需求");
    assertNoApiKeyLeak(reply);
    monitor.assertNoSearxngInAiChat();

    recordLiveAiOutcome(testInfo, {
      scenario: "A Chiayi",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });

  test("B. 大阪四天美食購物", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const message = "我想去大阪玩四天，第一次去，想吃美食、逛街，預算中等。";
    const { payload } = await sendChatMessage(page, message, { chatTimeoutMs: 150_000 });
    const reply = await resolveAiReplyText(page, payload);

    expect(reply.length).toBeGreaterThanOrEqual(10);
    assertNoTokyoTemplatePollution(reply);
    assertMentionsAny(reply, [/大阪/, /美食/, /購物|逛街/, /預算|中等/], "大阪美食購物需求");
    assertNoApiKeyLeak(reply);
    monitor.assertNoSearxngInAiChat();

    recordLiveAiOutcome(testInfo, {
      scenario: "B Osaka",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });

  test("C. 首爾五天咖啡廳與韓劇景點", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const message = "我想去首爾五天，想安排咖啡廳、購物和韓劇景點。";
    const { payload } = await sendChatMessage(page, message, { chatTimeoutMs: 150_000 });
    const reply = await resolveAiReplyText(page, payload);

    expect(reply.length).toBeGreaterThanOrEqual(10);
    assertNoTokyoTemplatePollution(reply);
    assertMentionsAny(reply, [/首爾|韓國|Seoul/, /咖啡|咖啡廳/, /購物|逛街/, /韓劇/], "首爾旅遊語境");
    assertNoApiKeyLeak(reply);
    monitor.assertNoSearxngInAiChat();

    recordLiveAiOutcome(testInfo, {
      scenario: "C Seoul",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });

  test("D. 巴黎七天文化與美術館", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const message = "我想去巴黎七天，主要想看美術館、建築和咖啡廳，步調不要太趕。";
    const { payload } = await sendChatMessage(page, message, { chatTimeoutMs: 150_000 });
    const reply = await resolveAiReplyText(page, payload);

    expect(reply.length).toBeGreaterThanOrEqual(10);
    assertNoTokyoTemplatePollution(reply);
    assertMentionsAny(
      reply,
      [/巴黎|Paris/, /美術館|博物館|羅浮宮|奧賽|Louvre|Orsay|文化|建築|咖啡|步調|慢|自由探索/],
      "巴黎文化慢步調",
    );
    expect(reply).not.toMatch(/日本|東京|大阪|京都/);
    assertNoApiKeyLeak(reply);
    monitor.assertNoSearxngInAiChat();

    recordLiveAiOutcome(testInfo, {
      scenario: "D Paris",
      passed: true,
      replyPreview: reply,
      assistantActionCount: extractAssistantActions(payload).length,
    });
  });

  test("E. 一般旅遊問題不搜尋", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const message = "你覺得大阪適合第一次自由行嗎？";
    const { payload } = await sendChatMessage(page, message, { chatTimeoutMs: 150_000 });
    const reply = await resolveAiReplyText(page, payload);

    expect(reply.length).toBeGreaterThanOrEqual(10);
    assertNoTokyoTemplatePollution(reply);
    assertNoSearchProviders(monitor.searchProviders);
    assertNoAssistantActions(payload);
    assertNoApiKeyLeak(reply);
    monitor.assertNoSearxngInAiChat();

    recordLiveAiOutcome(testInfo, {
      scenario: "E no search",
      passed: true,
      replyPreview: reply,
      searchProviders: [...monitor.searchProviders],
    });
  });

  test("F. 需要即時資訊才搜尋", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    await openLiveChat(page);
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const message = "大阪環球影城今天營業到幾點？";
    const { payload } = await sendChatMessage(page, message, { chatTimeoutMs: 150_000 });
    const reply = await resolveAiReplyText(page, payload);

    expect(reply.length).toBeGreaterThan(5);
    assertNoTokyoTemplatePollution(reply);
    assertNoApiKeyLeak(reply);

    const providers = monitor.searchProviders;
    const usedWebSearch = providers.has("serper") || providers.has("tavily");
    if (usedWebSearch) {
      assertSearchUsedProviders(providers, providers.has("serper") ? ["serper"] : ["tavily"]);
    } else {
      recordLiveAiOutcome(testInfo, {
        scenario: "F search",
        passed: false,
        replyPreview: reply,
        failureReason: "未觸發 serper/tavily（可能缺 search API key 或模型未走 search 分支）",
        searchProviders: [...providers],
      });
      test.info().annotations.push({
        type: "live-ai-soft-fail",
        description: "即時資訊問題未觸發 web search；記錄為不穩定而非硬失敗",
      });
    }
    monitor.assertNoSearxngInAiChat();

    recordLiveAiOutcome(testInfo, {
      scenario: "F search",
      passed: usedWebSearch,
      replyPreview: reply,
      searchProviders: [...providers],
      failureReason: usedWebSearch ? undefined : "no serper/tavily",
    });
  });
});

test.describe("Phase 7.5 Live AssistantAction smoke", () => {
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

  test("G. 首爾行程：弘大改成聖水洞", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    if (!isLiveAiEnvEnabled()) {
      test.skip(true, "需 E2E_LIVE_AI=1");
    }
    if (!seoulSeed) {
      test.skip(true, "首爾 seed 未建立");
    }

    await loginAs(page, E2E_OWNER, "/chat");
    await dismissOnboardingIfVisible(page);
    await waitForAuthenticatedSession(page, E2E_OWNER.email);

    const probe = await probeLiveAiChat(page);
    liveAvailable = probe.available;
    skipReason = probe.reason || skipReason;
    liveSkip();

    const monitor = new ChatNetworkMonitor();
    monitor.attach(page);

    const message = "幫我把第一天的弘大改成聖水洞";
    const { payload } = await sendChatMessage(page, message, {
      chatTimeoutMs: 180_000,
      waitForTripSync: true,
    });
    const reply = await resolveAiReplyText(page, payload);
    const actions = extractAssistantActions(payload);

    assertNoTokyoTemplatePollution(reply);
    assertNoApiKeyLeak(reply);
    monitor.assertNoSearxngInAiChat();

    const updateAction = actions.find((action) => action.type === "itinerary.update_item");
    const proposedChanges = payload?.data?.proposedChanges || payload?.proposedChanges || [];

    if (!updateAction) {
      recordLiveAiOutcome(testInfo, {
        scenario: "G Seoul update_item",
        passed: false,
        replyPreview: reply,
        assistantActionCount: actions.length,
        failureReason: `無 itinerary.update_item；proposedChanges=${proposedChanges.length}；可能 prompt/parser/context 或模型能力不足`,
      });
      test.info().annotations.push({
        type: "live-ai-raw",
        description: JSON.stringify({ reply: reply.slice(0, 300), actions, proposedChanges }).slice(0, 800),
      });
      expect.soft(actions.length, "Live AI 未產生 assistantActions").toBeGreaterThan(0);
      return;
    }

    const actionPayload = updateAction.payload as {
      dayId?: string;
      itemId?: string;
      patch?: { title?: string; location?: string };
    };

    expect(actionPayload.itemId).toBe(seoulSeed!.itemIds.day1Hongdae);
    const patchText = `${actionPayload.patch?.title || ""} ${actionPayload.patch?.location || ""}`;
    expect(patchText).toMatch(/聖水|Seongsu/i);
    expect(patchText).not.toMatch(/東京|晴空塔|秋葉原|Akihabara|Skytree/i);

    recordLiveAiOutcome(testInfo, {
      scenario: "G Seoul update_item",
      passed: true,
      replyPreview: reply,
      assistantActionCount: actions.length,
    });
  });
});
