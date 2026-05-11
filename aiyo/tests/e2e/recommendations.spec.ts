import { expect, test, type Page } from "@playwright/test";
import { E2E_OWNER, seedAuthUsers } from "./helpers/auth";
import { resetE2EData } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

async function loginToHomeWithoutDismissingOnboarding(page: Page) {
  await seedAuthUsers();
  await page.context().clearCookies();
  await page.goto(`/login?callbackUrl=${encodeURIComponent("/")}`);
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();

  const emailInput = page.locator('input[name="email"]').filter({ visible: true });
  const passwordInput = page.locator('input[name="password"]').filter({ visible: true });
  await emailInput.fill(E2E_OWNER.email);
  await passwordInput.fill(E2E_OWNER.password);
  await emailInput.press("Enter");
  await expect(page).toHaveURL(/\/$/);
}

test("first-time login shows clean onboarding then six Taiwan-city recommendations after skip", async ({ page }) => {
  let recommendationCalls = 0;
  await page.route("**/api/videos/recommendations**", async (route) => {
    recommendationCalls += 1;
    await route.continue();
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await loginToHomeWithoutDismissingOnboarding(page);

  const modal = page.getByTestId("onboarding-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("歡迎使用 AIYO 設定目的地與旅遊天數");
  await expect(modal.getByTestId("video-card")).toHaveCount(0);
  await expect(modal.getByText("推薦影片")).toHaveCount(0);

  await page.getByTestId("onboarding-skip-button").dispatchEvent("click");
  await expect(modal).toBeHidden();

  await expect(page.getByText("推薦影片")).toBeVisible();
  await expect(page.getByText("預設推薦").first()).toBeVisible();
  await expect(page.getByTestId("video-card")).toHaveCount(6);
  await expect(page.getByText(/台北|新北|桃園|台中|台南|高雄/).first()).toBeVisible();
  expect(recommendationCalls).toBe(0);
});

test("keyword search updates video cards and hides noisy description text", async ({ page }) => {
  await page.route("**/api/videos/recommendations**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: "youtube_chiayi_qa",
            videoId: "chiayi-qa",
            title: "嘉義美食一日遊：火雞肉飯、砂鍋魚頭、文化路夜市",
            thumbnail: "",
            url: "https://www.youtube.com/watch?v=chiayi-qa",
            duration: "12:34",
            summary: "從嘉義東市場開始，吃阿宏師火雞肉飯，再到林聰明砂鍋魚頭。",
            description:
              "從嘉義東市場開始，吃阿宏師火雞肉飯，再到林聰明砂鍋魚頭。\n請記得訂閱、按讚分享。\nhttps://example.com\n#嘉義美食 #subscribe",
            source: "youtube-data-api",
            channelTitle: "QA Travel",
            publishedAt: "2026-01-01T00:00:00.000Z",
            timestamps: [],
            extractedLocations: [
              { name: "阿宏師火雞肉飯" },
              { name: "林聰明砂鍋魚頭" },
            ],
            summarySegments: [],
            listProvenance: "youtube-data-api",
          },
        ],
        meta: { source: "youtube-data-api" },
      }),
    });
  });

  await loginToHomeWithoutDismissingOnboarding(page);
  await expect(page.getByTestId("onboarding-modal")).toBeVisible();
  await page.getByTestId("onboarding-skip-button").dispatchEvent("click");
  await expect(page.getByTestId("onboarding-modal")).toBeHidden();

  await page.getByTestId("video-search-input").fill("嘉義美食");
  await page.getByTestId("video-search-submit").dispatchEvent("click");

  const card = page.getByTestId("video-card").filter({ hasText: "嘉義美食一日遊" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("阿宏師火雞肉飯");
  await expect(card).not.toContainText("訂閱");
  await expect(card).not.toContainText("https://");
  await expect(card).not.toContainText("#嘉義美食");
});
