import { expect, test } from "@playwright/test";

test("collaboration route remains protected for unauthenticated users", async ({ page }) => {
  await page.goto("/collaborate");
  await expect(page).toHaveURL(/\/login/);
});

