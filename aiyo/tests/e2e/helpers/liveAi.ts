import { expect, type TestInfo } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import type { ChatApiPayload } from "./chat";

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
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return "";
  }
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/u)
    .find((row) => row.startsWith(`${name}=`));
  if (!line) {
    return "";
  }
  return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "");
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

  const probe = await page.evaluate(async () => {
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
