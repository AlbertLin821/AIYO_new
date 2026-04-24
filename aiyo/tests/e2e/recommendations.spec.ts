import { expect, test } from "@playwright/test";

test("empty onboarding state shows six Taiwan-city recommendations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("推薦旅遊影片")).toBeVisible();
  await expect(page.getByTestId("recommended-video")).toHaveCount(6);
  await expect(page.getByText(/台北|台中|台南|高雄|新北|桃園/).first()).toBeVisible();
});

test("destination and days can request Tainan-oriented recommendations", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/例如/).fill("台南");
  await page.locator("input[type='number']").fill("3");
  await page.getByLabel("重新推薦").click();
  await expect(page.getByText(/台南/).first()).toBeVisible();
});
