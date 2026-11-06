import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedTokyoPhase7ScenarioForUser } from "./helpers/db";

test("a selected map place opens a scoped AI edit draft", async ({ page }) => {
  await resetE2EData();
  try {
    const { owner } = await seedAuthUsers();
    const trip = await seedTokyoPhase7ScenarioForUser(owner.id);
    await loginAs(page, E2E_OWNER, "/map");
    const marker = page.getByTestId("map-view").getByRole("button", { name: "秋葉原" });
    await expect(marker).toBeVisible({ timeout: 40_000 });
    await marker.click();
    const panel = page.getByTestId("map-pin-info-panel");
    if (!(await panel.isVisible())) await marker.click();
    await expect(panel).toBeVisible();
    await panel.getByRole("link", { name: "用 AI 安排行程" }).click();
    await expect(page).toHaveURL(/\/chat\?draft=/);
    await expect(page.getByTestId("chat-input")).toHaveValue(/秋葉原/);
    await page.route(`**/api/trips/${trip.tripId}/agent/preview`, async (route) => {
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ success: false, error: { code: "invalid_agent_proposal", message: "測試預覽" } }) });
    }, { times: 1 });
    const request = page.waitForRequest((candidate) => candidate.url().endsWith(`/api/trips/${trip.tripId}/agent/preview`) && candidate.method() === "POST");
    await page.getByTestId("chat-input").fill("把目前行程的秋葉原移到第三天");
    await page.getByTestId("chat-send-button").click();
    expect((await request).postDataJSON().selectedEntityIds).toContain(trip.itemIds.day2Akihabara);
  } finally {
    await resetE2EData();
  }
});
