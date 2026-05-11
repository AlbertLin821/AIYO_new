import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedChiayiScenarioForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test.describe("AI chat structured proposedChanges", () => {
  test.beforeAll(async () => {
    await resetE2EData();
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });

  test("AI proposedChanges require confirmation and persist after reload", async ({ page }) => {
    await page.route("**/api/ai/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            reply: {
              id: "assistant_structured_test",
              role: "assistant",
              content: "我建議把文化路夜市放在第一天晚上，作為小吃散步收尾。",
              timestamp: "18:30",
              proposedChanges: [{
                type: "add_itinerary_item",
                day: 1,
                time: "18:30",
                title: "文化路夜市小吃散步",
                locationName: "文化路夜市",
                notes: "晚餐後步行覓食，保留彈性。",
                source: "ai-chat",
              }],
            },
            proposedChanges: [{
              type: "add_itinerary_item",
              day: 1,
              time: "18:30",
              title: "文化路夜市小吃散步",
              locationName: "文化路夜市",
              notes: "晚餐後步行覓食，保留彈性。",
              source: "ai-chat",
            }],
          },
        }),
      });
    });

    await loginAs(page, E2E_OWNER, "/chat");
    await dismissOnboardingIfVisible(page);
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 40_000 });
    const chatInput = page.getByTestId("chat-input");
    await chatInput.click();
    await chatInput.fill("請幫我把文化路夜市加到第一天晚上");
    await expect(chatInput).toHaveValue("請幫我把文化路夜市加到第一天晚上");
    await expect(page.getByTestId("chat-send-button")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("chat-send-button").dispatchEvent("click");

    await expect(page.getByTestId("chat-message-ai").last()).toContainText("文化路夜市");
    await expect(page.getByTestId("chat-apply-proposed-changes")).toBeVisible();

    const saveResponse = page.waitForResponse(
      (res) => res.url().includes("/api/trips/current") && res.request().method() === "PUT" && res.ok(),
      { timeout: 60_000 },
    );
    await page.getByTestId("chat-apply-proposed-changes").dispatchEvent("click");
    await saveResponse;

    await expect(page).toHaveURL(/\/itinerary/);
    await expect(page.getByTestId("activity-card").filter({ hasText: "文化路夜市小吃散步" })).toBeVisible({
      timeout: 40_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("activity-card").filter({ hasText: "文化路夜市小吃散步" })).toBeVisible({
      timeout: 40_000,
    });
  });
});
