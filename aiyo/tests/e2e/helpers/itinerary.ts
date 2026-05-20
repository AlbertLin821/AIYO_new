import { expect, type Page } from "@playwright/test";

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

  await landingCards.first().click();
  await expect(editor).toBeVisible({ timeout: 40_000 });
}
