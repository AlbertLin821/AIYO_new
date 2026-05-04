import { expect, test } from "@playwright/test";

test("legacy /collaborate redirects unauthenticated users to login via /itinerary", async ({ page }) => {
  await page.goto("/collaborate");
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
});

