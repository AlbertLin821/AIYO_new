import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, E2E_OWNER, loginAs, seedAuthUsers } from "./helpers/auth";

test("profile name Enter saves to the server and survives reload", async ({ page }) => {
  await seedAuthUsers();
  await loginAs(page, E2E_OWNER, "/profile");
  await dismissOnboardingIfVisible(page);
  await page.getByRole("button", { name: E2E_OWNER.name, exact: true }).click();
  const input = page.getByRole("textbox");
  await input.fill("Profile Enter QA");
  const saved = page.waitForResponse((res) =>
    res.url().endsWith("/api/profile") && res.request().method() === "PUT");
  await input.press("Enter");
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Profile Enter QA", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Profile Enter QA", exact: true })).toBeVisible();
});
