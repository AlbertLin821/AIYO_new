import { expect, type Page, type Response } from "@playwright/test";
import type { BootstrapPayload, PersistedTripPayload } from "@/types";
import { openItineraryEditor } from "./itinerary";

export type ChatApiPayload = {
  success?: boolean;
  data?: {
    reply?: {
      id?: string;
      role?: string;
      content?: string;
      responseType?: string;
      statusSteps?: Array<{ provider?: string; label?: string; phase?: string }>;
    };
    assistantActions?: Array<{ type: string; payload?: unknown }>;
    proposedChanges?: unknown[];
    itinerarySuggestion?: unknown;
  };
  assistantActions?: Array<{ type: string; payload?: unknown }>;
  proposedChanges?: unknown[];
  itinerarySuggestion?: unknown;
  error?: { code?: string; message?: string };
};

export type UiItineraryItemSnapshot = {
  title: string;
  time?: string;
};

export type UiItineraryDaySnapshot = {
  dayNumber: number;
  title: string;
  items: UiItineraryItemSnapshot[];
};

export type UiItinerarySnapshot = {
  days: UiItineraryDaySnapshot[];
};

export type ConsoleCapture = {
  errors: Array<{ type: "console" | "pageerror"; text: string }>;
  detach: () => void;
};

export type NetworkFailureCapture = {
  failures: Array<{ url: string; method: string; status?: number; errorText?: string }>;
  detach: () => void;
};

export class ChatNetworkMonitor {
  readonly chatResponses: ChatApiPayload[] = [];
  readonly searchProviders = new Set<string>();
  private attached = false;

  attach(page: Page) {
    if (this.attached) {
      return;
    }
    this.attached = true;

    page.on("response", async (response: Response) => {
      const url = response.url();
      if (!url.includes("/api/ai/chat") || response.request().method() !== "POST") {
        return;
      }
      try {
        const payload = (await response.json()) as ChatApiPayload;
        this.chatResponses.push(payload);
        for (const step of payload.data?.reply?.statusSteps || []) {
          if (step.provider) {
            this.searchProviders.add(step.provider);
          }
        }
      } catch {
        // ignore non-json
      }
    });
  }

  lastChatPayload(): ChatApiPayload | undefined {
    return this.chatResponses.at(-1);
  }
}

export function captureConsoleErrors(page: Page): ConsoleCapture {
  const errors: ConsoleCapture["errors"] = [];
  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") {
      errors.push({ type: "console", text: msg.text() });
    }
  };
  const onPageError = (error: Error) => {
    errors.push({ type: "pageerror", text: error.message });
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    errors,
    detach: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
    },
  };
}

export function captureNetworkFailures(page: Page): NetworkFailureCapture {
  const failures: NetworkFailureCapture["failures"] = [];
  const onRequestFailed = (request: import("@playwright/test").Request) => {
    const url = request.url();
    if (!/\/api\/(ai\/chat|chat\/message|trips|bootstrap|map\/geocode|places\/geocode|search)/.test(url)) {
      return;
    }
    const errorText = request.failure()?.errorText;
    if (errorText === "net::ERR_ABORTED") {
      return;
    }
    failures.push({
      url,
      method: request.method(),
      errorText,
    });
  };
  const onResponse = (response: Response) => {
    const url = response.url();
    if (!/\/api\/(ai\/chat|chat\/message|trips|bootstrap|map\/geocode|places\/geocode|search)/.test(url)) {
      return;
    }
    if (!response.ok()) {
      failures.push({
        url,
        method: response.request().method(),
        status: response.status(),
      });
    }
  };
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);
  return {
    failures,
    detach: () => {
      page.off("requestfailed", onRequestFailed);
      page.off("response", onResponse);
    },
  };
}

function postDataMatchesMessage(postData: string | null, message: string): boolean {
  if (!postData) {
    return false;
  }
  try {
    const body = JSON.parse(postData) as { message?: string };
    return body.message?.trim() === message.trim();
  } catch {
    return postData.includes(message);
  }
}

export type SendChatMessageOptions = {
  waitForTripSync?: boolean;
  waitForTripPutDayOrder?: {
    dayNumber: number;
    orderedTitlePatterns: Array<string | RegExp>;
    timeoutMs?: number;
  };
  chatTimeoutMs?: number;
  retryOnFailure?: boolean;
  /** Force structured travel planning flag on POST /api/ai/chat (UI usually infers this). */
  structuredTravelPlanning?: boolean;
};

function tripPutResponseMatchesDayOrder(
  response: Response,
  dayNumber: number,
  orderedTitlePatterns: Array<string | RegExp>,
): boolean {
  if (!response.url().includes("/api/trips/current") || response.request().method() !== "PUT" || !response.ok()) {
    return false;
  }
  try {
    const body = response.request().postDataJSON() as {
      itinerary?: Array<{ dayNumber: number; items: Array<{ title: string }> }>;
    };
    const day = body.itinerary?.find((candidate) => candidate.dayNumber === dayNumber);
    const titles = (day?.items || []).map((item) => item.title);
    if (titles.length < orderedTitlePatterns.length) {
      return false;
    }
    return orderedTitlePatterns.every((pattern, index) => {
      const title = titles[index] || "";
      return typeof pattern === "string" ? title.includes(pattern) : pattern.test(title);
    });
  } catch {
    return false;
  }
}

function createTripPutWaiter(
  page: Page,
  options: SendChatMessageOptions | undefined,
  isChatCompleted: () => boolean,
): Promise<Response> | undefined {
  if (options?.waitForTripPutDayOrder) {
    const { dayNumber, orderedTitlePatterns, timeoutMs = 90_000 } = options.waitForTripPutDayOrder;
    return page.waitForResponse(
      (response) =>
        isChatCompleted() &&
        tripPutResponseMatchesDayOrder(response, dayNumber, orderedTitlePatterns),
      { timeout: timeoutMs },
    );
  }
  if (options?.waitForTripSync) {
    return page.waitForResponse(
      (res) =>
        isChatCompleted() &&
        res.url().includes("/api/trips/current") &&
        res.request().method() === "PUT" &&
        res.ok(),
      { timeout: 90_000 },
    );
  }
  return undefined;
}

export type SendChatMessageResult = {
  response: Response;
  payload?: ChatApiPayload;
  attempts: number;
  firstFailure?: { status: number; bodyPreview: string };
};

async function withStructuredTravelPlanningRoute<T>(
  page: Page,
  enabled: boolean,
  run: () => Promise<T>,
): Promise<T> {
  if (!enabled) {
    return run();
  }
  const handler = async (route: import("@playwright/test").Route) => {
    if (route.request().method() !== "POST" || !route.request().url().includes("/api/ai/chat")) {
      await route.fallback();
      return;
    }
    const postData = route.request().postDataJSON() as Record<string, unknown>;
    postData.structuredTravelPlanning = true;
    await route.fallback({ postData: JSON.stringify(postData) });
  };
  await page.route("**/api/ai/chat", handler);
  try {
    return await run();
  } finally {
    await page.unroute("**/api/ai/chat", handler);
  }
}

async function waitForAssistantRender(page: Page, timeoutMs: number) {
  const assistantBubbles = page.getByTestId("chat-message-ai");
  const travelPlanCards = page.locator("[data-travel-plan-message-id]");
  await expect
    .poll(
      async () => {
        const [assistantCount, travelPlanCount] = await Promise.all([
          assistantBubbles.count(),
          travelPlanCards.count(),
        ]);
        return assistantCount > 0 || travelPlanCount > 0;
      },
      {
        timeout: timeoutMs,
        message: "expected assistant reply to render in chat",
      },
    )
    .toBeTruthy();
}

async function sendChatMessageOnce(
  page: Page,
  message: string,
  chatTimeoutMs: number,
  options?: SendChatMessageOptions,
): Promise<{ response: Response; payload?: ChatApiPayload }> {
  return withStructuredTravelPlanningRoute(page, Boolean(options?.structuredTravelPlanning), async () => {
  const chatInput = page.getByTestId("chat-input");
  await expect(chatInput).toBeVisible({ timeout: 40_000 });

  const stopButton = page.getByTestId("chat-stop-button");
  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.click();
    await expect(page.getByTestId("chat-send-button")).toBeVisible({ timeout: 30_000 });
  }

  await chatInput.click();
  await chatInput.fill(message);
  await expect(page.getByTestId("chat-send-button")).toBeEnabled({ timeout: 20_000 });

  const chatResponse = page.waitForResponse(
    (res) =>
      res.url().includes("/api/ai/chat") &&
      res.request().method() === "POST" &&
      postDataMatchesMessage(res.request().postData(), message),
    { timeout: chatTimeoutMs },
  );
  let chatCompleted = false;
  const tripPutResponse = createTripPutWaiter(page, options, () => chatCompleted);

  await page.getByTestId("chat-send-button").click();
  const chatRes = await chatResponse;
  chatCompleted = true;

  let payload: ChatApiPayload | undefined;
  try {
    payload = (await chatRes.json()) as ChatApiPayload;
  } catch {
    payload = undefined;
  }

  if (!chatRes.ok()) {
    const bodyPreview = payload ? JSON.stringify(payload).slice(0, 500) : await chatRes.text().then((t) => t.slice(0, 500));
    throw Object.assign(new Error(`chat API ${chatRes.status()}: ${bodyPreview}`), {
      status: chatRes.status(),
      bodyPreview,
      payload,
    });
  }

  await waitForAssistantRender(page, 60_000);

  if (tripPutResponse) {
    await tripPutResponse;
    await page.waitForTimeout(500);
  }

  return { response: chatRes, payload };
  });
}

export async function sendChatMessage(
  page: Page,
  message: string,
  options?: SendChatMessageOptions,
): Promise<SendChatMessageResult> {
  const chatTimeoutMs = options?.chatTimeoutMs ?? 90_000;
  const maxAttempts = options?.retryOnFailure === false ? 1 : 2;
  let firstFailure: SendChatMessageResult["firstFailure"];
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { response, payload } = await sendChatMessageOnce(page, message, chatTimeoutMs, options);

      return { response, payload, attempts: attempt, firstFailure };
    } catch (error) {
      lastError = error;
      const status = typeof (error as { status?: number }).status === "number" ? (error as { status: number }).status : 0;
      const bodyPreview =
        typeof (error as { bodyPreview?: string }).bodyPreview === "string"
          ? (error as { bodyPreview: string }).bodyPreview
          : error instanceof Error
            ? error.message.slice(0, 500)
            : String(error).slice(0, 500);
      if (!firstFailure) {
        firstFailure = { status, bodyPreview };
      }
      if (attempt >= maxAttempts) {
        break;
      }
      await page.waitForTimeout(2_000);
      await page.getByTestId("chat-input").fill(message);
    }
  }

  expect.soft(firstFailure, "第一次 chat 失敗原因").toBeTruthy();
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getChatLastAssistantMessage(page: Page): Promise<string> {
  await waitForAssistantRender(page, 60_000);

  const assistantBubbles = page.getByTestId("chat-message-ai");
  if ((await assistantBubbles.count()) > 0) {
    const bubble = assistantBubbles.last();
    await expect(bubble).toBeVisible({ timeout: 60_000 });
    return ((await bubble.innerText()) || "").trim();
  }

  const card = page.locator("[data-travel-plan-message-id]").last();
  await expect(card).toBeVisible({ timeout: 60_000 });
  return ((await card.innerText()) || "").trim();
}

export async function sendChatAndWaitForCompletion(
  page: Page,
  message: string,
  options?: SendChatMessageOptions,
): Promise<SendChatMessageResult & { lastAssistantMessage: string }> {
  const result = await sendChatMessage(page, message, options);
  const stopButton = page.getByTestId("chat-stop-button");
  await stopButton.waitFor({ state: "hidden", timeout: options?.chatTimeoutMs ?? 120_000 }).catch(() => undefined);
  await expect(page.getByTestId("chat-send-button")).toBeVisible({ timeout: 30_000 });
  const lastAssistantMessage = await getChatLastAssistantMessage(page).catch(() => {
    const replyContent =
      result.payload?.data?.reply?.content ||
      (result.payload as { reply?: { content?: string } } | undefined)?.reply?.content;
    if (replyContent?.trim()) {
      return replyContent.trim();
    }
    throw new Error("assistant reply did not render in chat UI and payload had no replyText");
  });
  return { ...result, lastAssistantMessage };
}

export async function expectItineraryActivity(page: Page, title: string, visible = true) {
  await page.goto("/itinerary");
  await openItineraryEditor(page);
  const card = page.getByTestId("activity-card").filter({ hasText: title });
  if (visible) {
    await expect(card.first()).toBeVisible({ timeout: 40_000 });
  } else {
    await expect(card).toHaveCount(0, { timeout: 20_000 });
  }
}

export async function waitForTripPutDayOrder(
  page: Page,
  dayNumber: number,
  orderedTitlePatterns: Array<string | RegExp>,
  timeoutMs = 90_000,
) {
  await page.waitForResponse(
    (response) => tripPutResponseMatchesDayOrder(response, dayNumber, orderedTitlePatterns),
    { timeout: timeoutMs },
  );
}

export async function fetchTripItineraryFromBootstrap(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/bootstrap", { cache: "no-store", credentials: "same-origin" });
    const json = (await response.json()) as {
      success?: boolean;
      error?: { message?: string };
      data?: { trip?: { itinerary?: Array<{ dayNumber: number; items: Array<{ title: string }> }> } | null };
    };
    if (!response.ok || !json.success) {
      throw new Error(
        `bootstrap ${response.status}: ${json.error?.message || "unknown error"} (${new URL(response.url).pathname})`,
      );
    }
    return json.data?.trip?.itinerary || [];
  });
}

export async function fetchBootstrapPayload(page: Page): Promise<BootstrapPayload> {
  return page.evaluate(async () => {
    const response = await fetch("/api/bootstrap", { cache: "no-store", credentials: "same-origin" });
    const json = (await response.json()) as {
      success?: boolean;
      error?: { message?: string };
      data?: BootstrapPayload;
    };
    if (!response.ok || !json.success || !json.data) {
      throw new Error(
        `bootstrap ${response.status}: ${json.error?.message || "unknown error"} (${new URL(response.url).pathname})`,
      );
    }
    return json.data;
  });
}

export async function fetchCurrentTripId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const response = await fetch("/api/trips/current", { cache: "no-store", credentials: "same-origin" });
    const json = (await response.json()) as {
      success?: boolean;
      data?: { tripId?: string | null };
    };
    return json.success ? json.data?.tripId || null : null;
  });
}

export async function fetchPersistedTripFromBootstrap(page: Page): Promise<PersistedTripPayload | null> {
  const payload = await fetchBootstrapPayload(page);
  return payload.trip;
}

export async function getCurrentItineraryFromUI(page: Page): Promise<UiItinerarySnapshot> {
  const originalPath = new URL(page.url()).pathname;
  let navigatedToItinerary = false;
  let dayCards = page.getByTestId("itinerary-day-card");
  if ((await dayCards.count()) === 0) {
    navigatedToItinerary = originalPath !== "/itinerary";
    await page.goto("/itinerary");
    await openItineraryEditor(page);
    dayCards = page.getByTestId("itinerary-day-card");
  }
  await expect(dayCards.first()).toBeVisible({ timeout: 40_000 });
  const dayCount = await dayCards.count();
  const days: UiItineraryDaySnapshot[] = [];

  for (let index = 0; index < dayCount; index += 1) {
    const dayCard = dayCards.nth(index);
    const cardText = ((await dayCard.innerText()) || "").trim();
    const dayNumberMatch = cardText.match(/Day\s*(\d+)|第\s*(\d+)\s*天/u);
    const dayNumber = Number(dayNumberMatch?.[1] || dayNumberMatch?.[2] || index + 1);
    const activityCards = dayCard.getByTestId("activity-card");
    const itemCount = await activityCards.count();
    const items: UiItineraryItemSnapshot[] = [];

    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const text = ((await activityCards.nth(itemIndex).innerText()) || "").trim();
      const lines = text
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
      const time = lines.find((line) => /^\d{1,2}:\d{2}/u.test(line));
      const title = lines.find((line) => !/^\d{1,2}:\d{2}/u.test(line)) || lines[0] || "";
      items.push({ title, time });
    }

    days.push({
      dayNumber,
      title: cardText.split(/\r?\n/u)[0] || `Day ${dayNumber}`,
      items,
    });
  }

  const snapshot = { days };
  if (navigatedToItinerary) {
    await page.goto(originalPath);
  }
  return snapshot;
}

export function assertItineraryUnchanged(before: UiItinerarySnapshot, after: UiItinerarySnapshot) {
  expect(after).toEqual(before);
}

export function assertOnlyTargetItemChanged(
  before: UiItinerarySnapshot,
  after: UiItinerarySnapshot,
  targetDay: number,
  targetTitleOrId: string,
) {
  expect(after.days.length).toBe(before.days.length);

  for (const beforeDay of before.days) {
    const afterDay = after.days.find((candidate) => candidate.dayNumber === beforeDay.dayNumber);
    expect(afterDay, `missing day ${beforeDay.dayNumber}`).toBeTruthy();
    if (!afterDay) {
      continue;
    }

    if (beforeDay.dayNumber !== targetDay) {
      expect(afterDay.items).toEqual(beforeDay.items);
      continue;
    }

    expect(afterDay.items.length).toBe(beforeDay.items.length);
    let changedCount = 0;
    for (let index = 0; index < beforeDay.items.length; index += 1) {
      const beforeItem = beforeDay.items[index];
      const afterItem = afterDay.items[index];
      const targetMatch =
        beforeItem?.title.includes(targetTitleOrId) || afterItem?.title.includes(targetTitleOrId);
      if (beforeItem?.title !== afterItem?.title || beforeItem?.time !== afterItem?.time) {
        changedCount += 1;
        expect(targetMatch, `unexpected item changed on day ${targetDay}`).toBeTruthy();
      }
    }
    expect(changedCount, `expected one target change on day ${targetDay}`).toBeGreaterThanOrEqual(1);
  }
}

function day2TitlesMatchOrder(titles: string[], orderedTitles: string[]) {
  if (titles.length < orderedTitles.length) {
    return false;
  }
  for (let index = 0; index < orderedTitles.length; index += 1) {
    const expected = orderedTitles[index]!;
    const actual = titles[index] || "";
    if (expected.includes("晴空塔")) {
      if (!/晴空塔/.test(actual)) {
        return false;
      }
    } else if (!actual.includes(expected)) {
      return false;
    }
  }
  return true;
}

export async function expectDay2Order(page: Page, orderedTitles: string[]) {
  await page.goto("/itinerary");
  await openItineraryEditor(page);

  const day2Card = page.getByTestId("itinerary-day-card").nth(1);
  let lastUiTitles: string[] = [];

  await expect
    .poll(
      async () => {
        const cards = day2Card.getByTestId("activity-card");
        const count = await cards.count();
        lastUiTitles = [];
        for (let index = 0; index < count; index += 1) {
          lastUiTitles.push((await cards.nth(index).textContent()) || "");
        }
        return day2TitlesMatchOrder(lastUiTitles, orderedTitles);
      },
      {
        timeout: 60_000,
        message: `Day 2 UI order mismatch: expected [${orderedTitles.join(", ")}], last UI [${lastUiTitles.join(" | ")}]`,
      },
    )
    .toBe(true);

  let lastBootstrapTitles: string[] = [];
  await expect
    .poll(
      async () => {
        const itinerary = await fetchTripItineraryFromBootstrap(page);
        const day2 = itinerary.find((day) => day.dayNumber === 2);
        lastBootstrapTitles = (day2?.items || []).map((item) => item.title);
        return day2TitlesMatchOrder(lastBootstrapTitles, orderedTitles);
      },
      {
        timeout: 60_000,
        message: `Day 2 bootstrap order mismatch: expected [${orderedTitles.join(", ")}], last bootstrap [${lastBootstrapTitles.join(", ")}]`,
      },
    )
    .toBe(true);
}
