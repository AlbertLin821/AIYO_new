import { expect, test } from "@playwright/test";
import { E2E_OWNER, loginAs, seedAuthUsers } from "./helpers/auth";
import { resetE2EData, seedTripForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test("map page shows the map surface without the onboarding modal", async ({ page }) => {
  await page.goto("/map");

  await expect(page.getByTestId("onboarding-modal")).toHaveCount(0);
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.locator(".gm-style, .map-mock-shell").first()).toBeVisible();
  await expect(page.getByText("正在載入 Google 地圖")).toHaveCount(0);
});

test("authenticated map sync shows linked pins and editable manual activities", async ({ page }) => {
  const { owner } = await seedAuthUsers();
  await seedTripForUser(owner.id, "E2E Map Sync 台南行程");

  await loginAs(page, E2E_OWNER, "/map");

  await expect(page.getByTestId("onboarding-modal")).toHaveCount(0);
  await expect(page.getByTestId("map-view")).toBeVisible();
  await expect(page.getByRole("button", { name: "赤崁樓" })).toBeVisible();

  await page.getByRole("button", { name: "赤崁樓" }).click();
  const selectedPin = page.getByTestId("selected-map-pin");
  await expect(selectedPin).toBeVisible();
  await expect(selectedPin).toContainText("赤崁樓");
  await expect(selectedPin).toContainText("台南市中西區民族路二段212號");
  await expect(selectedPin).toContainText("營業時間");
  await expect(selectedPin).toContainText("電話");
  await expect(selectedPin).toContainText("尚未提供");
  await expect(page.getByTestId("map-route-link")).toHaveAttribute("href", /google\.com\/maps\/dir/);

  await page.waitForTimeout(1500);
  await expect(page.getByText("新增活動")).toBeVisible();
  await page.getByTestId("itinerary-panel-add-activity").first().dispatchEvent("click");
  const titleInput = page.getByTestId("itinerary-panel-title-input");
  if (!(await titleInput.isVisible({ timeout: 1500 }).catch(() => false))) {
    await page.getByText("新活動").last().dispatchEvent("click");
  }
  await expect(titleInput).toBeVisible();
  await titleInput.fill("QA 手動新增咖啡");
  await titleInput.press("Enter");
  await expect(page.getByText("QA 手動新增咖啡")).toBeVisible();
});
