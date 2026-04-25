import { expect, test } from "@playwright/test";
import { E2E_OWNER, loginAs, seedAuthUsers } from "./helpers/auth";
import { resetE2EData, seedTripForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test("itinerary list remains protected for unauthenticated users", async ({ page }) => {
  await page.goto("/itinerary");
  await expect(page).toHaveURL(/\/login/);
});

test("authenticated user can add and delete an itinerary activity", async ({ page }) => {
  const { owner } = await seedAuthUsers();
  await seedTripForUser(owner.id, "E2E Add Activity 台南行程");

  await loginAs(page, E2E_OWNER);

  await page.getByTestId("add-activity-button").first().click();
  await page.getByTestId("activity-title-input").fill("第五輪 QA 赤崁樓");
  await page.getByTestId("activity-time-input").fill("10:00");
  await page.getByTestId("activity-location-input").fill("台南市中西區");
  await page.getByTestId("activity-notes-input").fill("古蹟景點");
  await page.getByTestId("activity-save-button").click();

  const activityCard = page.getByTestId("activity-card").filter({ hasText: "第五輪 QA 赤崁樓" });
  await expect(activityCard).toBeVisible();
  await expect(activityCard).toContainText("台南市中西區");
  await expect(activityCard).toContainText("古蹟景點");

  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByTestId("activity-card").filter({ hasText: "第五輪 QA 赤崁樓" })).toBeVisible();

  const reloadedCard = page.getByTestId("activity-card").filter({ hasText: "第五輪 QA 赤崁樓" });
  await reloadedCard.hover();
  await reloadedCard.getByTestId("activity-delete-button").click();
  await expect(page.getByTestId("activity-card").filter({ hasText: "第五輪 QA 赤崁樓" })).toHaveCount(0);
});

