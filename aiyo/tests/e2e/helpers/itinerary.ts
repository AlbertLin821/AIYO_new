import { expect, type Page } from "@playwright/test";

export async function openItineraryEditor(page: Page) {
  const editor = page.getByTestId("itinerary-editor");
  if (await editor.isVisible({ timeout: 1500 }).catch(() => false)) {
    return;
  }

  const landingCards = page.getByTestId("trip-landing-card");
  await expect(landingCards.first()).toBeVisible({ timeout: 40_000 });
  await landingCards.first().click();
  await expect(editor).toBeVisible({ timeout: 40_000 });
}
