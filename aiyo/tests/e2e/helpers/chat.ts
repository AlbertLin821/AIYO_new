import { expect, type Page, type Response } from "@playwright/test";
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
      await route.continue();
      return;
    }
    const postData = route.request().postDataJSON() as Record<string, unknown>;
    postData.structuredTravelPlanning = true;
    await route.continue({ postData: JSON.stringify(postData) });
  };
  await page.route("**/api/ai/chat", handler);
  try {
    return await run();
  } finally {
    await page.unroute("**/api/ai/chat", handler);
  }
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

  await expect(page.getByTestId("chat-message-ai").last()).toBeVisible({ timeout: 60_000 });

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
