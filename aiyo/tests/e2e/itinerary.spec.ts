import { expect, test } from "@playwright/test";

test("itinerary list remains protected for unauthenticated users", async ({ page }) => {
  await page.goto("/itinerary");
  await expect(page).toHaveURL(/\/login/);
});

