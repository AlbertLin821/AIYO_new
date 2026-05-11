import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedChiayiScenarioForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test.describe("行程活動持久化", () => {
  test.beforeAll(async () => {
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });

  test("新增活動後重整仍從 bootstrap 載回", async ({ page }) => {
    await loginAs(page, E2E_OWNER, "/itinerary");
    const initialBootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 40_000 },
    );
    await page.goto("/itinerary");
    await initialBootstrap.catch(() => {});
    await dismissOnboardingIfVisible(page);

    await expect(page.getByTestId("itinerary-editor")).toBeVisible({ timeout: 40_000 });
    await page.getByTestId("add-activity-button").first().click();
    await page.getByTestId("activity-title-input").fill("嘉義市立美術館拍照");
    await page.getByTestId("activity-time-input").fill("15:30");
    await page.getByTestId("activity-type-select").selectOption("attraction");
    await page.getByTestId("activity-notes-input").fill("安排室內展覽與拍照，適合作為下午行程。");

    const saveResponse = page.waitForResponse(
      (res) => res.url().includes("/api/trips/current") && res.request().method() === "PUT" && res.ok(),
      { timeout: 30_000 },
    );
    await page.getByTestId("activity-save-button").click();
    await saveResponse;

    await expect(page.getByTestId("activity-card").filter({ hasText: "嘉義市立美術館拍照" })).toBeVisible();

    const bootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 40_000 },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await bootstrap.catch(() => {});
    await dismissOnboardingIfVisible(page);

    const reloadedCard = page.getByTestId("activity-card").filter({ hasText: "嘉義市立美術館拍照" });
    await expect(reloadedCard).toBeVisible({ timeout: 40_000 });
    await expect(reloadedCard).toContainText("15:30");
    await expect(reloadedCard).toContainText("安排室內展覽與拍照，適合作為下午行程。");
  });
});
