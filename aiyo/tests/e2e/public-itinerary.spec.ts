import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedPublishedTripForUser, seedTripForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test("unauthenticated users see login CTA on recommended itineraries panel", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-recommend-tab-itineraries").click();
  await expect(page.getByTestId("public-itinerary-login-cta")).toBeVisible();
  await expect(page.getByText("登入後查看社群推薦行程")).toBeVisible();
});

test("publish → home list → detail → copy flow", async ({ page }) => {
  const { owner } = await seedAuthUsers();
  const { publicationId } = await seedPublishedTripForUser(owner.id, "E2E 公開台南");

  await loginAs(page, E2E_OWNER, "/");
  await dismissOnboardingIfVisible(page);
  await waitForAuthenticatedSession(page, E2E_OWNER.email);

  const authedList = await page.request.get("/api/trips/public");
  const listBody = await authedList.text();
  expect(authedList.ok(), `public list failed: ${authedList.status()} ${listBody}`).toBeTruthy();

  await page.getByTestId("home-recommend-tab-itineraries").click();

  const card = page.getByTestId("recommended-itinerary-card").filter({ hasText: "E2E 公開台南" });
  await expect(card).toBeVisible({ timeout: 15_000 });

  await card.click();
  await expect(page).toHaveURL(new RegExp(`/itinerary/public/${publicationId}`));
  await expect(page.getByRole("heading", { name: "E2E 公開台南" })).toBeVisible();
  await expect(page.getByTestId("public-itinerary-item").filter({ hasText: "赤崁樓" })).toBeVisible();
  await expect(page.getByText("E2E seeded stop")).toHaveCount(0);

  const copyResponse = page.waitForResponse(
    (res) =>
      res.url().includes(`/api/trips/public/${publicationId}/copy`) &&
      res.request().method() === "POST" &&
      res.ok(),
    { timeout: 30_000 },
  );
  await page.getByTestId("copy-public-itinerary-button").click();
  await copyResponse;
  await expect(page.getByRole("button", { name: "編輯行程" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "去看地圖" }).click();
  await expect(page).toHaveURL(/\/trip\//, { timeout: 20_000 });
  await expect(
    page.getByTestId("map-view").getByRole("button", { name: "赤崁樓", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "行程規劃" }).click();
  await expect(page).toHaveURL(/\/itinerary/, { timeout: 20_000 });
  await expect(page.getByTestId("activity-card").filter({ hasText: "赤崁樓" })).toBeVisible({
    timeout: 20_000,
  });
});

test("itinerary editor exposes publish dialog for trip owner", async ({ page }) => {
  const { owner } = await seedAuthUsers();
  await seedTripForUser(owner.id, "E2E 公開對話框");

  await loginAs(page, E2E_OWNER, "/itinerary");
  await dismissOnboardingIfVisible(page);

  await page.getByRole("button", { name: /開啟行程：E2E 公開對話框/ }).click();
  await expect(page.getByTestId("publish-itinerary-button")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("publish-itinerary-button").click();
  await expect(page.getByTestId("publish-itinerary-dialog")).toBeVisible();
  await expect(page.getByText("活動備註與描述")).toBeVisible();

  const publishResponse = page.waitForResponse(
    (res) => res.url().includes("/publish") && res.request().method() === "POST" && res.ok(),
    { timeout: 30_000 },
  );
  await page.getByTestId("publish-itinerary-confirm").click();
  await publishResponse;
});
