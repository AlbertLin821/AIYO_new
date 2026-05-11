import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { E2E_COLLABORATOR, E2E_OWNER, seedAuthUsers, type E2EUser } from "./db";

export { E2E_COLLABORATOR, E2E_OWNER, seedAuthUsers };

function loginCallbackPath(callbackUrl: string): string {
  if (!callbackUrl || callbackUrl === "/") {
    return "/";
  }
  return callbackUrl.startsWith("/") ? callbackUrl : `/${callbackUrl}`;
}

/** 路徑比對（視 `/itinerary`、`/itinerary/`、`/` 為登入後合理落地） */
function normalizePathSegment(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.replace(/\/+$/, "") || "/";
}

async function expectPostLoginPath(page: Page, callbackUrl: string) {
  const want = normalizePathSegment(loginCallbackPath(callbackUrl));
  const readPath = () => normalizePathSegment(new URL(page.url()).pathname);

  try {
    await expect.poll(readPath, { timeout: 12_000 }).toBe(want);
    return;
  } catch {
    await page
      .locator("form")
      .getByRole("button", { name: "登入" })
      .filter({ visible: true })
      .click({ timeout: 10_000 })
      .catch(() => {});
  }

  await expect
    .poll(readPath, {
      message: `登入後應落在 ${want}`,
      timeout: 60_000,
    })
    .toBe(want);
}

export async function dismissOnboardingIfVisible(page: Page) {
  const modal = page.getByTestId("onboarding-modal");

  if (await modal.isVisible({ timeout: 1500 }).catch(() => false)) {
    const controls = [
      page.getByTestId("onboarding-skip-button"),
      page.getByTestId("onboarding-start-button"),
      page.getByTestId("onboarding-close-button"),
    ];

    for (const control of controls) {
      if (await control.isVisible({ timeout: 250 }).catch(() => false)) {
        await control.dispatchEvent("click").catch(async () => {
          await control.click({ force: true, timeout: 1000 }).catch(() => {});
        });
        break;
      }
    }

    await expect(modal).toBeHidden({ timeout: 5000 }).catch(() => {});
  }

  await page
    .getByTestId("onboarding-overlay")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {});
}

export async function loginAs(page: Page, user: E2EUser, callbackUrl = "/itinerary") {
  await page.context().clearCookies();
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.reload();
  await dismissOnboardingIfVisible(page);
  const emailInput = page.locator('input[name="email"]').filter({ visible: true });
  const passwordInput = page.locator('input[name="password"]').filter({ visible: true });
  await emailInput.fill(user.email);
  await passwordInput.fill(user.password);
  await emailInput.press("Enter");

  await expectPostLoginPath(page, callbackUrl);
  await dismissOnboardingIfVisible(page);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}
