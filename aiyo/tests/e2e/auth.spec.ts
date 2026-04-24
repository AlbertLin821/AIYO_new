import { expect, test } from "@playwright/test";

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
