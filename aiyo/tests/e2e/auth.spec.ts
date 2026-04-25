import { expect, test } from "@playwright/test";
import { E2E_OWNER, loginAs, seedAuthUsers } from "./helpers/auth";

test("unauthenticated itinerary access redirects to login", async ({ page }) => {
  await page.goto("/itinerary");
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated folder API returns 401", async ({ request }) => {
  const response = await request.get("/api/itinerary-folders");
  expect(response.status()).toBe(401);
});

test("unauthenticated collaborators API returns 401 before authorization", async ({ request }) => {
  const response = await request.get("/api/trips/example-trip/collaborators");
  expect(response.status()).toBe(401);
});

test("mobile login form should be usable at 390px width", async ({ page }) => {
  await seedAuthUsers();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login?callbackUrl=%2Fitinerary");

  await expect(page.locator('input[name="email"]').filter({ visible: true })).toBeVisible();
  await expect(page.locator('input[name="password"]').filter({ visible: true })).toBeVisible();
  await expect(page.locator("form").getByRole("button", { name: "登入" }).filter({ visible: true })).toBeVisible();

  await loginAs(page, E2E_OWNER);
  await expect(page).toHaveURL(/\/itinerary/);
});
