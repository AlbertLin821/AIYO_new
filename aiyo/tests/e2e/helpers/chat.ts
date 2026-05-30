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
};

export class ChatNetworkMonitor {
  readonly chatResponses: ChatApiPayload[] = [];
  readonly searchProviders = new Set<string>();
  readonly searxngHits: string[] = [];
  private attached = false;

  attach(page: Page) {
    if (this.attached) {
      return;
    }
    this.attached = true;

    page.on("response", async (response: Response) => {
      const url = response.url();
      if (!url.includes("/api/ai/chat") || response.request().method() !== "POST") {
        if (url.includes("searxng") && (url.includes("/api/ai") || url.includes("web-search"))) {
          this.searxngHits.push(url);
        }
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
        const bodyText = JSON.stringify(payload);
        if (/searxng/i.test(bodyText)) {
          this.searxngHits.push(url);
        }
      } catch {
        // ignore non-json
      }
    });
  }

  assertNoSearxngInAiChat() {
    expect(this.searxngHits, "AI chat 路徑不應出現 searxng provider").toEqual([]);
    for (const provider of this.searchProviders) {
      expect(provider, `不允許的搜尋 provider: ${provider}`).not.toBe("searxng");
      expect(["serper", "tavily", "mock_web", "ollama", "google_places", "open_meteo", "youtube"].includes(provider) || provider === undefined).toBeTruthy();
    }
  }

  lastChatPayload(): ChatApiPayload | undefined {
    return this.chatResponses.at(-1);
  }
}

export async function sendChatMessage(
  page: Page,
  message: string,
  options?: { waitForTripSync?: boolean; chatTimeoutMs?: number },
) {
  const chatInput = page.getByTestId("chat-input");
  await expect(chatInput).toBeVisible({ timeout: 40_000 });
  await chatInput.click();
  await chatInput.fill(message);
  await expect(page.getByTestId("chat-send-button")).toBeEnabled({ timeout: 20_000 });

  const chatResponse = page.waitForResponse(
    (res) => res.url().includes("/api/ai/chat") && res.request().method() === "POST",
    { timeout: options?.chatTimeoutMs ?? 90_000 },
  );

  await page.getByTestId("chat-send-button").click();
  const chatRes = await chatResponse;
  expect(chatRes.ok()).toBeTruthy();

  await expect(page.getByTestId("chat-message-ai").last()).toBeVisible({ timeout: 60_000 });

  if (options?.waitForTripSync) {
    await page.waitForResponse(
      (res) => res.url().includes("/api/trips/current") && res.request().method() === "PUT" && res.ok(),
      { timeout: 90_000 },
    );
    // PUT may finish before applyAssistantActions completes; allow store to settle.
    await page.waitForTimeout(500);
  }
  let payload: ChatApiPayload | undefined;
  try {
    payload = (await chatRes.json()) as ChatApiPayload;
  } catch {
    payload = undefined;
  }
  return { response: chatRes, payload };
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
    async (response) => {
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
    },
    { timeout: timeoutMs },
  );
}

export async function fetchTripItineraryFromBootstrap(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/bootstrap", { cache: "no-store", credentials: "same-origin" });
    const json = await response.json();
    return (json.data?.trip?.itinerary || []) as Array<{
      dayNumber: number;
      items: Array<{ title: string }>;
    }>;
  });
}

export async function expectDay2Order(page: Page, orderedTitles: string[]) {
  await page.goto("/itinerary");
  await openItineraryEditor(page);

  let lastTitles: string[] = [];
  await expect
    .poll(
      async () => {
        const itinerary = await fetchTripItineraryFromBootstrap(page);
        const day2 = itinerary.find((day) => day.dayNumber === 2);
        lastTitles = (day2?.items || []).map((item) => item.title);
        if (lastTitles.length < orderedTitles.length) {
          return false;
        }
        for (let index = 0; index < orderedTitles.length; index += 1) {
          const expected = orderedTitles[index]!;
          const actual = lastTitles[index] || "";
          if (expected.includes("晴空塔")) {
            if (!/晴空塔/.test(actual)) {
              return false;
            }
          } else if (!actual.includes(expected)) {
            return false;
          }
        }
        return true;
      },
      {
        timeout: 60_000,
        message: `Day 2 order mismatch: expected [${orderedTitles.join(", ")}]`,
      },
    )
    .toBe(true);

  const day2Card = page.getByTestId("itinerary-day-card").nth(1);
  const cards = day2Card.getByTestId("activity-card");
  for (let index = 0; index < orderedTitles.length; index += 1) {
    const title = orderedTitles[index]!;
    const pattern = title.includes("晴空塔") ? /晴空塔/ : title;
    await expect(cards.nth(index)).toContainText(pattern);
  }
}
