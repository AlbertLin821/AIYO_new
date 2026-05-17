import { expect, test } from "@playwright/test";
import { E2E_OWNER, loginAs, seedAuthUsers } from "./helpers/auth";
import { resetE2EData, seedTwoLocatedStopsTripForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test("map page shows the map surface without the onboarding modal", async ({ page }) => {
  await seedAuthUsers();
  await loginAs(page, E2E_OWNER, "/map");

  await expect(page.getByTestId("onboarding-modal")).toHaveCount(0);
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.locator(".gm-style, .map-mock-shell").first()).toBeVisible();
  await expect(page.getByText("正在載入 Google 地圖")).toHaveCount(0);
});

test("authenticated map sync focuses selected itinerary stop and shows linked routes", async ({ page }) => {
  const { owner } = await seedAuthUsers();
  await seedTwoLocatedStopsTripForUser(owner.id);

  await loginAs(page, E2E_OWNER, "/map");

  await expect(page.getByTestId("onboarding-modal")).toHaveCount(0);
  await expect(page.getByTestId("map-view")).toBeVisible();
  const openPanelButton = page.getByRole("button", { name: /行程/i });
  if (await openPanelButton.isVisible().catch(() => false)) {
    await openPanelButton.click();
  }
  const itineraryStop = page.locator('[role="button"][tabindex="0"]').filter({ hasText: "赤崁樓" });
  await expect(itineraryStop).toBeVisible();

  await itineraryStop.click();
  const selectedPin = page.getByTestId("selected-map-pin");
  await expect(selectedPin).toBeVisible();
  await expect(selectedPin).toContainText("赤崁樓");
  await expect(selectedPin).toContainText("地址");
  await expect(selectedPin).toContainText("規劃路線");
  await expect(page.getByTestId("selected-map-route").first()).toBeVisible();
  await expect(page.getByTestId("map-route-link")).toHaveAttribute("href", /google\.com\/maps\/dir/);
});
