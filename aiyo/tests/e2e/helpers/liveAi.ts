import { expect, type TestInfo } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { ChatApiPayload } from "./chat";
import { fetchTripItineraryFromBootstrap, sendChatMessage } from "./chat";
import { forbiddenPlaceholderTitles } from "../../../src/server/ai/planning/itineraryPlanningStandard";
import { readProjectEnvLocal } from "../../../src/lib/projectEnv";

export type ItineraryBootstrapDay = {
  dayNumber: number;
  items: Array<{ title: string }>;
};

export type ItinerarySnapshot = {
  totalItems: number;
  titles: string[];
  days: ItineraryBootstrapDay[];
};

const LIVE_DESTINATION_POOL = ["台中", "高雄", "福岡", "曼谷", "京都"] as const;

const LIVE_INTEREST_PAIRS: Array<[string, string]> = [
  ["美食", "文化"],
  ["購物", "咖啡"],
  ["自然", "歷史"],
  ["夜市", "博物館"],
  ["景點", "在地小吃"],
];

let liveDestinationRotation = 0;

/** Round-robin destination pool; override with E2E_LIVE_DEST or E2E_LIVE_DESTINATION. */
export function pickRandomLiveDestination(seed?: number): string {
  const override = (process.env.E2E_LIVE_DEST || process.env.E2E_LIVE_DESTINATION)?.trim();
  if (override) {
    return override;
  }
  const index =
    typeof seed === "number"
      ? Math.abs(seed) % LIVE_DESTINATION_POOL.length
      : liveDestinationRotation++ % LIVE_DESTINATION_POOL.length;
  return LIVE_DESTINATION_POOL[index]!;
}

export function pickLiveInterestPair(seed?: number): [string, string] {
  const index =
    typeof seed === "number"
      ? Math.abs(seed) % LIVE_INTEREST_PAIRS.length
      : liveDestinationRotation % LIVE_INTEREST_PAIRS.length;
  return LIVE_INTEREST_PAIRS[index]!;
}

export function buildLiveTripPlanningMessage(destination: string, interests?: [string, string]): string {
  const [a, b] = interests || pickLiveInterestPair();
  return `幫我安排${destination}三天兩夜，${a}跟${b}，步調輕鬆一點`;
}

export async function fetchItineraryFromBootstrap(page: Page): Promise<ItineraryBootstrapDay[]> {
  return fetchTripItineraryFromBootstrap(page);
}

export async function snapshotItinerary(page: Page): Promise<ItinerarySnapshot> {
  const days = await fetchItineraryFromBootstrap(page);
  const titles = days.flatMap((day) => day.items.map((item) => item.title));
  return {
    days,
    titles,
    totalItems: titles.length,
  };
}

export async function assertItineraryUnchanged(page: Page, snapshot: ItinerarySnapshot) {
  const current = await snapshotItinerary(page);
  expect(current.totalItems, "itinerary item count should stay unchanged").toBe(snapshot.totalItems);
  expect(current.titles, "itinerary titles should stay unchanged").toEqual(snapshot.titles);
}

export function assertNoPlaceholderItineraryTitles(titles: string[]) {
  const joined = titles.join("\n");
  for (const placeholder of forbiddenPlaceholderTitles) {
    expect(joined, `itinerary 不應含 placeholder：${placeholder}`).not.toContain(placeholder);
  }
  expect(joined, "不應含泛用 synthetic 標題").not.toMatch(/代表性景點|文化體驗|市區自由探索/);
}

export function assertItineraryStructure(days: ItineraryBootstrapDay[], minDays = 2) {
  expect(days.length, `行程至少 ${minDays} 天`).toBeGreaterThanOrEqual(minDays);
  for (const day of days) {
    expect(day.items.length, `Day ${day.dayNumber} 至少 1 個活動`).toBeGreaterThanOrEqual(1);
    for (const item of day.items) {
      expect(item.title, "活動 title 不應以 ・ 合併多 POI").not.toMatch(/・|／|\//);
      assertNoPlaceholderItineraryTitles([item.title]);
    }
  }
}

export function isQuestionCardPayload(payload: ChatApiPayload | undefined): boolean {
  return payload?.data?.reply?.responseType === "question_card";
}

export function isTravelPlanPayload(payload: ChatApiPayload | undefined): boolean {
  return payload?.data?.reply?.responseType === "travel_plan";
}

/** Accept inline preference reuse panel when prior profile prefs exist. */
export async function acceptPreferenceReuseIfVisible(
  page: Page,
  chatTimeoutMs = 240_000,
): Promise<ChatApiPayload | undefined> {
  const panel = page.getByTestId("preference-reuse-panel");
  try {
    await panel.waitFor({ state: "visible", timeout: 4_000 });
  } catch {
    return undefined;
  }

  const chatResponse = page.waitForResponse(
    (res) => res.url().includes("/api/ai/chat") && res.request().method() === "POST",
    { timeout: chatTimeoutMs },
  );
  await page.getByTestId("preference-reuse-accept").click();
  const res = await chatResponse;
  try {
    return (await res.json()) as ChatApiPayload;
  } catch {
    return undefined;
  }
}

export async function waitForChatComposerIdle(page: Page, timeoutMs = 120_000) {
  const stopButton = page.getByTestId("chat-stop-button");
  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.waitFor({ state: "hidden", timeout: timeoutMs });
  }
  await expect(page.getByTestId("chat-send-button")).toBeVisible({ timeout: 30_000 });
}

export async function isWorkflowQuestionCardVisible(page: Page): Promise<boolean> {
  const activeSelector = '[data-submitted="false"]:has(button.rounded-full:not([disabled]))';
  const modalCard = page.locator(`[role="dialog"] ${activeSelector}`);
  if ((await modalCard.count()) > 0 && (await modalCard.first().isVisible())) {
    return true;
  }
  const inlineCard = page.locator(activeSelector).first();
  return inlineCard.isVisible().catch(() => false);
}

/** Click first/recommended options in workflow question card and submit. */
export async function answerQuestionCardDefaults(page: Page, timeoutMs = 60_000) {
  const activeSelector = '[data-submitted="false"]:has(button.rounded-full:not([disabled]))';
  const modalCard = page.locator(`[role="dialog"] ${activeSelector}`).first();
  const inlineCard = page.locator(activeSelector).first();
  const card = (await modalCard.isVisible().catch(() => false)) ? modalCard : inlineCard;
  try {
    await card.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    return;
  }

  const optionButtons = card.locator("button.rounded-full");
  const optionCount = await optionButtons.count();
  if (optionCount > 0) {
    await optionButtons.first().click();
  }

  const dateInputs = card.locator('input[type="date"]');
  const dateCount = await dateInputs.count();
  if (dateCount > 0) {
    const start = new Date();
    start.setDate(start.getDate() + 14);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const fmt = (value: Date) => value.toISOString().slice(0, 10);
    if (dateCount >= 1) {
      await dateInputs.nth(0).fill(fmt(start));
    }
    if (dateCount >= 2) {
      await dateInputs.nth(1).fill(fmt(end));
    }
  }

  const textInputs = card.locator('input[type="text"], input[type="number"]');
  const textCount = await textInputs.count();
  for (let index = 0; index < textCount; index += 1) {
    const input = textInputs.nth(index);
    if (((await input.inputValue()) || "").trim().length === 0) {
      await input.fill("2");
    }
  }

  const submit = card.locator("button").filter({ hasText: /繼續|送出|確認|開始規劃/ }).last();
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
}

export async function waitForLiveItineraryPlan(
  page: Page,
  options?: { minDays?: number; timeoutMs?: number },
): Promise<ItineraryBootstrapDay[]> {
  const minDays = options?.minDays ?? 2;
  const timeoutMs = options?.timeoutMs ?? 120_000;
  let lastDays: ItineraryBootstrapDay[] = [];

  await expect
    .poll(
      async () => {
        lastDays = await fetchItineraryFromBootstrap(page);
        return lastDays.length >= minDays && lastDays.every((day) => day.items.length >= 1);
      },
      { timeout: timeoutMs, message: `等待 bootstrap itinerary >= ${minDays} 天且每日有活動` },
    )
    .toBe(true);

  return lastDays;
}

export async function countItineraryItems(page: Page): Promise<number> {
  const days = await fetchItineraryFromBootstrap(page);
  return days.reduce((sum, day) => sum + day.items.length, 0);
}

async function advanceLivePlanningDialogues(
  page: Page,
  lastPayload: ChatApiPayload | undefined,
  chatTimeoutMs: number,
  maxQuestionRounds: number,
): Promise<ChatApiPayload | undefined> {
  let payload = lastPayload;

  for (let round = 0; round < maxQuestionRounds; round += 1) {
    const preferencePayload = await acceptPreferenceReuseIfVisible(page, chatTimeoutMs);
    if (preferencePayload) {
      payload = preferencePayload;
      await expect(page.getByTestId("chat-message-ai").last()).toBeVisible({ timeout: 60_000 });
      continue;
    }

    if (await isWorkflowQuestionCardVisible(page)) {
      await answerQuestionCardDefaults(page);
      const followUpResponse = await page.waitForResponse(
        (res) => res.url().includes("/api/ai/chat") && res.request().method() === "POST" && res.ok(),
        { timeout: chatTimeoutMs },
      );
      try {
        payload = (await followUpResponse.json()) as ChatApiPayload;
      } catch {
        payload = undefined;
      }
      await expect(page.getByTestId("chat-message-ai").last()).toBeVisible({ timeout: 60_000 });
      continue;
    }

    if (isQuestionCardPayload(payload) || (await page.getByTestId("chat-stop-button").isVisible().catch(() => false))) {
      await waitForChatComposerIdle(page, chatTimeoutMs);
      continue;
    }

    break;
  }

  return payload;
}

export async function completeLiveTripPlanningFlow(
  page: Page,
  message: string,
  options?: {
    chatTimeoutMs?: number;
    structuredTravelPlanning?: boolean;
    maxQuestionRounds?: number;
    destination?: string;
  },
): Promise<{ lastPayload?: ChatApiPayload; days: ItineraryBootstrapDay[] }> {
  const chatTimeoutMs = options?.chatTimeoutMs ?? 240_000;
  const maxQuestionRounds = options?.maxQuestionRounds ?? 6;
  let lastPayload: ChatApiPayload | undefined;

  const initial = await sendChatMessage(page, message, {
    chatTimeoutMs,
    structuredTravelPlanning: options?.structuredTravelPlanning ?? true,
    waitForTripSync: false,
  });
  lastPayload = initial.payload;
  lastPayload = await advanceLivePlanningDialogues(page, lastPayload, chatTimeoutMs, maxQuestionRounds);
  await waitForChatComposerIdle(page, chatTimeoutMs).catch(() => undefined);

  const itemCount = await countItineraryItems(page);
  if (itemCount === 0 && !(await isWorkflowQuestionCardVisible(page))) {
    const dest = options?.destination || "這個目的地";
    const nudge = `請直接幫我排完整${dest}三天兩夜行程，列出每日具體景點與餐廳，不用再追問細節。`;
    const nudgeResult = await sendChatMessage(page, nudge, {
      chatTimeoutMs,
      structuredTravelPlanning: true,
      waitForTripSync: false,
    });
    lastPayload = nudgeResult.payload;
    lastPayload = await advanceLivePlanningDialogues(page, lastPayload, chatTimeoutMs, maxQuestionRounds);
  }

  if (isTravelPlanPayload(lastPayload)) {
    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/trips/current") && res.request().method() === "PUT" && res.ok(),
      { timeout: 90_000 },
    ).catch(() => undefined);
  }

  const days = await waitForLiveItineraryPlan(page, { timeoutMs: chatTimeoutMs });
  return { lastPayload, days };
}

export function extractMutationAssistantActions(payload: ChatApiPayload | undefined) {
  const actions = extractAssistantActions(payload);
  return actions.filter((action) =>
    /itinerary\.(add|update|remove|reorder)/.test(action.type),
  );
}

/** Phase 7 harness 常用東京測資 marker；非東京情境不應出現。 */
export const TOKYO_TEMPLATE_MARKERS = [
  "晴空塔",
  "東京晴空塔",
  "Skytree",
  "秋葉原",
  "Akihabara",
  "淺草寺",
  "淺草",
  "Asakusa",
  "東京鐵塔",
] as const;

export type LiveAiProbeResult = {
  available: boolean;
  reason?: string;
  status?: number;
};

export function isLiveAiEnvEnabled(): boolean {
  return process.env.E2E_LIVE_AI === "1";
}

let liveAvailabilityChecked = false;

function readEnvValue(name: string): string {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) {
    return fromProcess;
  }
  return readProjectEnvLocal(process.cwd())[name]?.trim() || "";
}

export function hasLiveSearchApiKeys(): boolean {
  if (readEnvValue("AIYO_WEB_SEARCH_MOCK") === "1") {
    return true;
  }
  return Boolean(readEnvValue("SERPER_API_KEY") || readEnvValue("TAVILY_API_KEY"));
}

export async function probeLiveAiChat(page: Page): Promise<LiveAiProbeResult> {
  if (!isLiveAiEnvEnabled()) {
    return { available: false, reason: "E2E_LIVE_AI 未設為 1" };
  }

  let probe:
    | {
        ok: boolean;
        status: number;
        success?: boolean;
        errorMessage?: string;
      }
    | undefined;
  try {
    probe = await page.evaluate(async () => {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "ping" }),
      });
      let body: { success?: boolean; error?: { message?: string } } | null = null;
      try {
        body = (await response.json()) as { success?: boolean; error?: { message?: string } };
      } catch {
        body = null;
      }
      return {
        ok: response.ok,
        status: response.status,
        success: body?.success,
        errorMessage: body?.error?.message,
      };
    });
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "probe fetch failed",
    };
  }

  if (!probe.ok) {
    return {
      available: false,
      reason: probe.errorMessage || `chat API HTTP ${probe.status}`,
      status: probe.status,
    };
  }

  return { available: true, status: probe.status };
}

export async function ensureLiveAiAvailability(
  page: Page,
  state: { liveAvailable: boolean; skipReason: string },
): Promise<void> {
  if (!isLiveAiEnvEnabled() || liveAvailabilityChecked) {
    return;
  }
  const probe = await probeLiveAiChat(page);
  state.liveAvailable = probe.available;
  state.skipReason = probe.reason || state.skipReason;
  liveAvailabilityChecked = true;
}

export function skipIfLiveAiUnavailable(liveAvailable: boolean, reason?: string) {
  if (!isLiveAiEnvEnabled()) {
    return { skip: true, reason: "需 E2E_LIVE_AI=1" };
  }
  if (!liveAvailable) {
    return { skip: true, reason: reason || "Live AI 不可用（缺 API key / LLM / 登入）" };
  }
  return { skip: false };
}

export function extractReplyText(payload: ChatApiPayload | undefined): string {
  return payload?.data?.reply?.content?.trim() || "";
}

export async function extractVisibleAiReply(page: import("@playwright/test").Page): Promise<string> {
  const bubble = page.getByTestId("chat-message-ai").last();
  await bubble.waitFor({ state: "visible", timeout: 60_000 });
  return (await bubble.innerText()).trim();
}

export async function resolveAiReplyText(
  page: import("@playwright/test").Page,
  payload: ChatApiPayload | undefined,
): Promise<string> {
  const apiReply = extractReplyText(payload);
  if (apiReply.length >= 8) {
    return apiReply;
  }
  return extractVisibleAiReply(page);
}

export function extractAssistantActions(payload: ChatApiPayload | undefined) {
  return payload?.data?.assistantActions || payload?.assistantActions || [];
}

export function assertNoTokyoTemplatePollution(
  text: string,
  options?: { allowTokyoMention?: boolean },
) {
  for (const marker of TOKYO_TEMPLATE_MARKERS) {
    expect(text, `不應出現東京測試模板 marker：${marker}`).not.toContain(marker);
  }
  if (!options?.allowTokyoMention) {
    expect(text, "非東京情境不應硬套東京三天行程模板").not.toMatch(/東京三天|去東京玩三天/);
  }
}

export function assertMentionsAny(text: string, patterns: Array<string | RegExp>, label: string) {
  const matched = patterns.some((pattern) =>
    typeof pattern === "string" ? text.includes(pattern) : pattern.test(text),
  );
  expect(matched, `回覆應提及 ${label}`).toBeTruthy();
}

export function assertNoAssistantActions(payload: ChatApiPayload | undefined) {
  const actions = extractAssistantActions(payload);
  expect(actions.length, "一般旅遊問答不應產生 assistantActions").toBe(0);
}

export function assertSearchUsedProviders(
  providers: Set<string>,
  expected: Array<"serper" | "tavily">,
) {
  expect(providers.size, "即時資訊問題應觸發 web search").toBeGreaterThan(0);
  for (const provider of expected) {
    expect(providers.has(provider), `應使用 ${provider} provider`).toBeTruthy();
  }
}

export function assertNoSearchProviders(providers: Set<string>) {
  const webProviders = [...providers].filter((provider) => provider === "serper" || provider === "tavily");
  expect(webProviders, "一般旅遊問題不應強制 web search").toEqual([]);
}

export function recordLiveAiOutcome(
  testInfo: TestInfo,
  outcome: {
    scenario: string;
    passed: boolean;
    replyPreview?: string;
    assistantActionCount?: number;
    searchProviders?: string[];
    failureReason?: string;
  },
) {
  testInfo.annotations.push({
    type: outcome.passed ? "live-ai-pass" : "live-ai-fail",
    description: [
      outcome.scenario,
      outcome.passed ? "PASS" : "FAIL",
      outcome.failureReason,
      outcome.replyPreview ? `reply=${outcome.replyPreview.slice(0, 160)}` : "",
      outcome.assistantActionCount !== undefined ? `actions=${outcome.assistantActionCount}` : "",
      outcome.searchProviders?.length ? `providers=${outcome.searchProviders.join(",")}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  });
}

export function assertNoApiKeyLeak(text: string) {
  expect(text).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
  expect(text).not.toMatch(/SERPER|TAVILY|OPENAI|ANTHROPIC/i);
}
