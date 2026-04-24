import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { E2E_COLLABORATOR, E2E_OWNER, seedAuthUsers, type E2EUser } from "./db";

export { E2E_COLLABORATOR, E2E_OWNER, seedAuthUsers };

export async function loginAs(page: Page, user: E2EUser, callbackUrl = "/itinerary") {
  await page.context().clearCookies();
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL(new RegExp(callbackUrl.replace("/", "\\/")));
  const onboarding = page.getByText("推薦旅遊影片");
  if (await onboarding.isVisible().catch(() => false)) {
    await page.mouse.click(10, 10);
    await expect(onboarding).toHaveCount(0);
  }
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}
