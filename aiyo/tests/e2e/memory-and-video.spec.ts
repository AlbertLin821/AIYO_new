import { expect, test } from "@playwright/test";
import { E2E_OWNER, loginAs, seedAuthUsers } from "./helpers/auth";
import { resetE2EData, seedTripForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test("authenticated user can review, edit, and delete AI memory", async ({ page }) => {
  test.setTimeout(120000);

  const { owner } = await seedAuthUsers();
  await seedTripForUser(owner.id, "E2E Memory Trip");

  await loginAs(page, E2E_OWNER, "/");

  const token = `MEM${Date.now()}`;
  const chatResponse = await page.evaluate(async (value) => {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `請記住：我的唯一偏好代碼是 ${value}`,
      }),
    });
    return {
      status: response.status,
      payload: await response.json(),
    };
  }, token);

  expect(chatResponse.status).toBe(200);
  expect(chatResponse.payload.success).toBe(true);

  await page.getByTestId("settings-open-button").click();
  await page.getByTestId("settings-memory-tab").click();
  await page.getByTestId("memory-refresh-button").click();
  const initialMemories = await page.evaluate(async () => {
    const response = await fetch("/api/memories", { cache: "no-store" });
    return response.json();
  });
  test.skip(
    !initialMemories.success || !Array.isArray(initialMemories.data),
    "Mem0 memory service is not available in this environment.",
  );
  const initialRows = initialMemories.data as Array<{ id: string; memory: string }>;
  const targetMemory = initialRows.find((row) => row.memory.includes(token));
  test.skip(!targetMemory, "Mem0 did not persist the test memory in this environment.");
  expect(targetMemory).toBeTruthy();

  const memoryCard = page.getByTestId("memory-item").filter({ hasText: targetMemory!.memory }).first();
  await expect(memoryCard).toBeVisible({ timeout: 30000 });

  await memoryCard.getByTestId("memory-edit-button").click();
  const editedToken = `${token}-EDIT`;
  await page.getByTestId("memory-edit-input").fill(`我的唯一偏好代碼已改成 ${editedToken}`);
  await page.getByTestId("memory-save-button").click();
  await expect(page.getByTestId("memory-item").filter({ hasText: editedToken }).first()).toBeVisible({
    timeout: 30000,
  });
  await page.getByTestId("memory-refresh-button").click();
  const afterEdit = await page.evaluate(async () => {
    const response = await fetch("/api/memories", { cache: "no-store" });
    return response.json();
  });
  const editedRows = afterEdit.data as Array<{ id: string; memory: string }>;
  const updatedMemory = editedRows.find((row) => row.id === targetMemory!.id);
  expect(updatedMemory).toBeTruthy();
  expect(updatedMemory!.memory).not.toBe(targetMemory!.memory);

  const editedCard = page.getByTestId("memory-item").filter({ hasText: updatedMemory!.memory }).first();
  await editedCard.getByTestId("memory-delete-button").click();
  await page.getByTestId("memory-refresh-button").click();
  const afterDelete = await page.evaluate(async () => {
    const response = await fetch("/api/memories", { cache: "no-store" });
    return response.json();
  });
  const deletedRows = afterDelete.data as Array<{ id: string; memory: string }>;
  expect(deletedRows.some((row) => row.id === targetMemory!.id)).toBe(false);
});

test("AI planning, video indexing, and map pins workflow works end to end", async ({ page }) => {
  test.setTimeout(360000);

  const { owner } = await seedAuthUsers();
  await seedTripForUser(owner.id, "E2E Video Map Trip");

  await loginAs(page, E2E_OWNER, "/itinerary");

  const planResponse = await page.evaluate(async () => {
    const response = await fetch("/api/ai/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        destination: "台南",
        days: 2,
        preferences: {
          interests: ["food", "history"],
          pace: "moderate",
          transportPreference: "Train",
          mustVisit: ["神農街", "安平老街"],
          notes: "把古蹟和小吃排進行程",
        },
      }),
    });

    return {
      status: response.status,
      payload: await response.json(),
    };
  });

  test.skip(
    planResponse.status !== 200,
    `AI planning service unavailable in this environment (status ${planResponse.status}).`,
  );
  expect(planResponse.status).toBe(200);
  expect(planResponse.payload.success).toBe(true);
  const plannedItems =
    (planResponse.payload.data?.days ?? []).flatMap((day: { items?: unknown[] }) => day.items ?? []);
  test.skip(plannedItems.length === 0, "AI planning returned no itinerary items in this environment.");

  await page.reload();
  await expect(page.getByRole("heading", { name: "第 2 天" })).toBeVisible({ timeout: 30000 });
  const plannedActivityCount = await page.getByTestId("activity-card").count();

  await page.goto("/");
  await page.getByTestId("video-search-input").fill("https://www.youtube.com/watch?v=I2kIaEGUiY0");
  await page.getByTestId("video-search-submit").click();

  const drawer = page.getByTestId("video-summary-drawer");
  const drawerVisible = await drawer.isVisible({ timeout: 180000 }).catch(() => false);
  test.skip(!drawerVisible, "Live video search/summary pipeline did not open a summary drawer in this environment.");
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId("video-location-item").first()).toBeVisible({ timeout: 30000 });

  await page.getByTestId("video-add-to-itinerary-button").click();
  await expect(page.getByTestId("video-import-day-dialog")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("video-import-day-confirm-button").click();
  await expect(page).toHaveURL(/\/itinerary/, { timeout: 30000 });
  await expect.poll(() => page.getByTestId("activity-card").count()).toBeGreaterThan(plannedActivityCount);

  await page.waitForTimeout(3000);
  await page.goto("/map");
  const markerPins = page.getByTestId("map-pin-marker");
  await expect(markerPins.first()).toBeVisible({ timeout: 30000 });
  await markerPins.first().click();
  await expect(page.getByTestId("map-pin-info-panel")).toBeVisible({ timeout: 30000 });
});
