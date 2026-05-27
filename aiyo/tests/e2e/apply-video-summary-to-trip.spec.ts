import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { ensureArtifactDirs, writeArtifactJson } from "./helpers/artifacts";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedChiayiScenarioForUser } from "./helpers/db";
import { installVideoApisE2EHarness } from "./helpers/recommendationRouteAugment";
import { waitForRecommendationsKeywordSearchResponse } from "./helpers/videoSearch";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test.describe("影片摘要套用到地圖與行程", () => {
  test.beforeAll(async () => {
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });

  test("點擊明確按鈕後會建立可持久化的 pins 與 itinerary items", async ({ page }) => {
    test.setTimeout(300_000);
    ensureArtifactDirs();
    await installVideoApisE2EHarness(page);
    await loginAs(page, E2E_OWNER, "/");
    const initialBootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 40_000 },
    );
    await page.goto("/");
    await initialBootstrap.catch(() => {});
    await dismissOnboardingIfVisible(page);
    await expect(page.getByTestId("video-search-input")).toBeVisible({ timeout: 40_000 });

    await page.getByTestId("video-search-input").fill("嘉義兩天一夜 美食 文化路夜市 林聰明砂鍋魚頭 民主火雞肉飯 檜意森活村 北門驛");
    const searchResponse = waitForRecommendationsKeywordSearchResponse(page);
    await page.getByTestId("video-search-submit").dispatchEvent("click");
    await searchResponse;

    const summarizeResponse = page.waitForResponse(
      (res) => res.url().includes("/api/videos/summarize") && res.request().method() === "POST" && res.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("video-card").first().click();
    await summarizeResponse;
    await expect(page.getByTestId("video-summary-drawer")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("video-location-item").filter({ hasText: "林聰明砂鍋魚頭" })).toBeVisible();

    const saveResponse = page.waitForResponse(
      (res) => res.url().includes("/api/trips/current") && res.request().method() === "PUT" && res.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("video-add-to-itinerary-button").click();
    await expect(page.getByTestId("video-import-day-dialog")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("video-import-day-confirm-button").click();
    await saveResponse;
    await expect(page).toHaveURL(/\/itinerary/);
    await expect(page.getByTestId("activity-card").filter({ hasText: "林聰明砂鍋魚頭" })).toBeVisible();
    await expect(page.getByTestId("activity-card").filter({ hasText: "民主火雞肉飯" })).toBeVisible();

    await page.goto("/map");
    const mapView = page.getByTestId("map-view");
    await expect(mapView.getByRole("button", { name: "林聰明砂鍋魚頭" })).toBeVisible({
      timeout: 40_000,
    });
    await expect(mapView.getByRole("button", { name: "民主火雞肉飯" })).toBeVisible();

    const mapPins = await page.getByTestId("map-pin-marker").evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") || ""),
    );
    expect(mapPins.join("\n")).not.toContain("走路就能逛夜市");
    expect(mapPins.join("\n")).not.toContain("火雞肉飯加青菜配無糖茶");
    writeArtifactJson("apply-video-summary-map-pins.json", { mapPins });

    const bootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 40_000 },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await bootstrap.catch(() => {});

    await expect(page.getByTestId("map-view").getByRole("button", { name: "文化路夜市" })).toBeVisible({
      timeout: 40_000,
    });
  });
});
