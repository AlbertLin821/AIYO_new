import { expect, test } from "@playwright/test";
import { mkdirSync } from "fs";
import path from "path";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import {
  ensureArtifactDirs,
  writeArtifactJson,
  writeArtifactNetwork,
} from "./helpers/artifacts";
import {
  resetE2EData,
  seedAuthUsers,
  seedChiayiScenarioForUser,
  E2E_OWNER,
} from "./helpers/db";
import { waitForRecommendationsKeywordSearchResponse } from "./helpers/videoSearch";
import {
  beginSummarizeResponseWatch,
  beginSummarySegmentWatch,
} from "./helpers/videoDrawerSummary";
import { installVideoApisHarnessWhenEnvEnabled } from "./helpers/videoHarnessEnv";

const VIDEO_QUERY =
  "嘉義兩天一夜 美食 文化路夜市 林聰明砂鍋魚頭 民主火雞肉飯 檜意森活村 北門驛";

const CHAT_PROMPT =
  "請根據我目前搜尋到的嘉義美食影片和地圖景點，幫我安排一個嘉義市 2 天 1 夜、2 人、預算 8000 元的行程。請優先使用文化路夜市、林聰明砂鍋魚頭、民主火雞肉飯、檜意森活村、北門驛，避免太趕，也不要安排阿里山深度行程。";

function redactSecrets<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(/([?&]key=)[^"&\s]+/g, "$1[REDACTED]"),
  ) as T;
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test.describe("嘉義兩天一夜完整旅人流程", () => {
  test.beforeAll(async () => {
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });

  test("首頁、影片搜尋與摘要、地圖、行程新增、聊天與工件", async ({
    page,
  }) => {
    test.setTimeout(600_000);
    ensureArtifactDirs();

    const screenshots = (...parts: string[]) =>
      path.join(process.cwd(), "tmp", "e2e-artifacts", "screenshots", ...parts);

    mkdirSync(path.dirname(screenshots("_")), { recursive: true });

    await installVideoApisHarnessWhenEnvEnabled(page);

    const consoleEntries: Array<{ type: string; text: string; ts: number }> =
      [];
    page.on("console", (msg) => {
      consoleEntries.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
    });

    const networkRows: Array<Record<string, unknown>> = [];
    page.on("response", async (response) => {
      try {
        const url = response.url();
        if (!/\/api\/(videos|ai|bootstrap|trips)/.test(url)) {
          return;
        }
        const method = response.request().method();
        const status = response.status();
        let bodyShape: unknown = "non-json";
        const ct = response.headers()["content-type"] || "";
        if (ct.includes("application/json")) {
          const body = await response.json();
          bodyShape =
            body && typeof body === "object" && !Array.isArray(body)
              ? Object.keys(body as object)
              : typeof body;
        }
        networkRows.push({
          method,
          url,
          status,
          bodyTopLevelKeys: bodyShape,
        });
      } catch {
        /* ignore */
      }
    });

    await loginAs(page, E2E_OWNER, "/");
    await page.goto("/");

    const onboard = page.getByTestId("onboarding-modal");
    if (await onboard.isVisible({ timeout: 8000 }).catch(() => false)) {
      await page.getByTestId("onboarding-destination-input").fill("嘉義市");
      await page.getByTestId("onboarding-days-input").fill("2");
      await page.getByTestId("onboarding-start-button").click();
      await expect(onboard).toBeHidden({ timeout: 15_000 });
    } else {
      await dismissOnboardingIfVisible(page);
    }

    await page.screenshot({
      path: screenshots("full-flow-01-home.png"),
      fullPage: true,
    });

    await expect(page.getByTestId("video-search-input")).toBeVisible({
      timeout: 90_000,
    });

    const recWait = waitForRecommendationsKeywordSearchResponse(page);
    await page.getByTestId("video-search-input").fill(VIDEO_QUERY);
    const submitBtn = page.getByTestId("video-search-submit");
    await expect(submitBtn).toBeEnabled({ timeout: 240_000 });
    await submitBtn.dispatchEvent("click");
    const recResponse = await recWait;
    const recBody = await recResponse.json().catch(() => null);
    writeArtifactJson("video-search-results-harness.json", recBody ?? { parseError: true });

    await expect(page.getByTestId("video-card").first()).toBeVisible({
      timeout: 180_000,
    });
    await page.screenshot({
      path: screenshots("full-flow-02-video-grid.png"),
      fullPage: true,
    });

    const summarizeTimeout = 420_000;
    const summarizeWatch = beginSummarizeResponseWatch(page, summarizeTimeout);

    await page.getByTestId("video-card").first().dispatchEvent("click");
    await expect(page.getByTestId("video-summary-drawer")).toBeVisible({
      timeout: 30_000,
    });

    const segmentWatch = beginSummarySegmentWatch(page, summarizeTimeout);
    const evidence = await Promise.race([summarizeWatch, segmentWatch]);
    await Promise.allSettled([summarizeWatch, segmentWatch]);

    if (evidence.from === "api") {
      writeArtifactJson(
        "video-summarize-raw-response.json",
        evidence.json,
      );
    } else {
      writeArtifactJson("video-summarize-raw-response.json", {
        note:
          evidence.from === "ui"
            ? "summary_segments_visible_summarize_optional"
            : "no_summarize_response_and_no_summary_segment",
        uiSegmentCount: await page.getByTestId("summary-segment").count(),
      });
    }

    await page.waitForTimeout(2500).catch(() => {});
    await page.screenshot({
      path: screenshots("full-flow-03-drawer.png"),
      fullPage: true,
    });

    const applyButton = page.getByTestId("video-add-to-itinerary-button");
    if (await applyButton.isVisible({ timeout: 15_000 }).catch(() => false)) {
      const applySave = page.waitForResponse(
        (res) =>
          res.url().includes("/api/trips/current") &&
          res.request().method() === "PUT" &&
          res.ok(),
        { timeout: 120_000 },
      );
      await applyButton.click();
      const importDialog = page.getByTestId("video-import-day-dialog");
      if (await importDialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await page.getByTestId("video-import-day-confirm-button").click();
      }
      await applySave.catch(() => {});
    }

    writeArtifactNetwork("network-summary-autocollect.json", redactSecrets(networkRows));
    writeArtifactNetwork("network-summary.json", redactSecrets(networkRows));

    await page.goto("/map");
    await expect(page.getByTestId("map-view")).toBeVisible({
      timeout: 90_000,
    });

    await expect(page.getByText("正在載入 Google 地圖")).toHaveCount(0);
    await page.screenshot({
      path: screenshots("full-flow-04-map.png"),
      fullPage: true,
    });

    const boot = await page
      .evaluate(async () => {
        const r = await fetch("/api/bootstrap", {
          credentials: "same-origin",
          cache: "no-store",
        });
        return r.json();
      })
      .catch(() => null);
    writeArtifactJson("bootstrap-snapshot-full-flow.json", boot);

    const rawPins =
      boot &&
      typeof boot === "object" &&
      boot !== null &&
      "data" in boot &&
      (boot as { data?: { trip?: { pins?: unknown } } }).data?.trip
        ? (boot as { data: { trip: { pins?: unknown } } }).data.trip.pins
        : [];

    const pinsArray = Array.isArray(rawPins) ? rawPins : [];
    writeArtifactJson(
      "map-pins.json",
      pinsArray.length > 0 ? pinsArray : { note: "empty_or_missing_pins", raw: rawPins },
    );

    const markers = page.getByTestId("map-pin-marker");
    const markerCount = await markers.count();
    const clicks = Math.min(markerCount, 3);
    for (let i = 0; i < clicks; i += 1) {
      await markers.nth(i).click();
      await expect(page.getByTestId("selected-map-pin")).toBeVisible({
        timeout: 15_000,
      });
    }
    await page.screenshot({
      path: screenshots("full-flow-05-marker-info.png"),
      fullPage: true,
    });

    await page.goto("/itinerary");
    await expect(page.locator('[data-testid="itinerary-editor"]:visible')).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByTestId("itinerary-day-card")).toHaveCount(2);

    await page.getByTestId("add-activity-button").first().click();
    await page.getByTestId("activity-title-input").fill("嘉義市立美術館拍照");
    await page.getByTestId("activity-time-input").fill("15:30");
    await page.getByTestId("activity-type-select").selectOption({ value: "attraction" });
    await page
      .getByTestId("activity-notes-input")
      .fill("安排室內展覽與拍照，適合作為下午行程。");
    const tripsPut = page.waitForResponse(
      (res) =>
        res.url().includes("/api/trips/current") &&
        res.request().method() === "PUT" &&
        res.ok(),
      { timeout: 120_000 },
    );

    await page.getByTestId("activity-save-button").click();
    await expect(
      page.getByTestId("activity-card").filter({ hasText: "嘉義市立美術館拍照" }),
    ).toBeVisible();

    await tripsPut;

    await page.reload();
    await expect(page.locator('[data-testid="itinerary-editor"]:visible')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByTestId("activity-card").filter({ hasText: "嘉義市立美術館拍照" }),
    ).toBeVisible({ timeout: 30_000 });

    writeArtifactJson("full-flow-editor-persistence.json", {
      museumActivityVisibleAfterReload: true,
      note: "reload_persist_ok_after_put_barrier",
    });

    await page.goto("/chat");
    const chatInput = page.locator('[data-testid="chat-input"]:visible');
    await expect(chatInput).toBeVisible({ timeout: 20_000 });
    await chatInput.click();
    await chatInput.fill(CHAT_PROMPT);
    await expect(chatInput).toHaveValue(CHAT_PROMPT);
    const chatSendButton = page.locator('[data-testid="chat-send-button"]:visible');
    await expect(chatSendButton).toBeEnabled({
      timeout: 20_000,
    });

    const chatStart = Date.now();
    const chatRespWait = page.waitForResponse(
      (res) =>
        res.url().includes("/api/ai/chat") &&
        res.request().method() === "POST",
      { timeout: 300_000 },
    );
    await chatSendButton.click();
    const chatHttp = await chatRespWait.catch(() => null);

    await expect(page.locator('[data-testid="chat-message-ai"]').last()).toBeVisible({
      timeout: 300_000,
    });
    const chatEnd = Date.now();
    const lastAiText = await page
      .locator('[data-testid="chat-message-ai"]')
      .last()
      .innerText();

    writeArtifactJson("ai-chat-response.json", {
      chatPrompt: CHAT_PROMPT,
      requestedAtMs: chatStart,
      responseVisibleAtMsApprox: chatEnd,
      elapsedMsApprox: chatEnd - chatStart,
      httpStatus: chatHttp?.status() ?? null,
      lastAiMessagePreview: lastAiText.slice(0, 6000),
    });

    await page.screenshot({
      path: screenshots("full-flow-06-chat.png"),
      fullPage: true,
    });

    const itineraryState = await page
      .evaluate(async () => {
        const r = await fetch("/api/bootstrap", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = await r.json();
        return j?.data?.trip ?? null;
      })
      .catch(() => null);
    writeArtifactJson(
      "itinerary-state.json",
      itineraryState ?? { error: "no_bootstrap_snapshot" },
    );

    writeArtifactJson(
      "console-messages.json",
      redactSecrets(consoleEntries.filter((e) => e.type === "error" || e.type === "warning")),
    );

    await page.goto("/itinerary");
    await expect(page.locator('[data-testid="itinerary-editor"]:visible')).toBeVisible({
      timeout: 40_000,
    });
    await page.screenshot({
      path: screenshots("full-flow-07-itinerary-final.png"),
      fullPage: true,
    });
  });
});
