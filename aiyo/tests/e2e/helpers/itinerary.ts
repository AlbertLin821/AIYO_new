import { expect, type Page } from "@playwright/test";

export async function expandAllItineraryDays(page: Page) {
  const dayCards = page.getByTestId("itinerary-day-card");
  const dayCount = await dayCards.count();
  for (let index = 0; index < dayCount; index += 1) {
    const card = dayCards.nth(index);
    const toggle = card.getByRole("button", { expanded: false }).first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    }
  }
}

export async function openItineraryEditor(page: Page) {
  const editor = page.getByTestId("itinerary-editor");
  const landingCards = page.getByTestId("trip-landing-card");
  const entryPoint = page
    .locator('[data-testid="itinerary-editor"], [data-testid="trip-landing-card"]')
    .first();

  await expect(entryPoint).toBeVisible({ timeout: 40_000 });
  if (await editor.isVisible({ timeout: 500 }).catch(() => false)) {
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await editor.isVisible({ timeout: 500 }).catch(() => false)) {
      return;
    }
    try {
      await landingCards.first().click({ timeout: 10_000 });
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }
  await expect(editor).toBeVisible({ timeout: 40_000 });
}
