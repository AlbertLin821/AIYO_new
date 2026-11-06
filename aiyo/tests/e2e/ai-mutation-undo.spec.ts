import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedChiayiScenarioForUser } from "./helpers/db";

test.describe("durable AI undo", () => {
  test.beforeAll(async () => {
    await resetE2EData();
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });
  test.afterAll(async () => { await resetE2EData(); });

  test("AI change can be undone after refresh and cannot overwrite a later edit", async ({ page }, info) => {
    await loginAs(page, E2E_OWNER, "/chat");
    await dismissOnboardingIfVisible(page);
    await expect(page.getByTestId("chat-active-trip")).toContainText("嘉義", { timeout: 20_000 });

    const created = await page.evaluate(async () => {
      const bootstrap = await fetch("/api/bootstrap").then((res) => res.json());
      const trip = bootstrap.data.trip;
      const title = trip.title;
      const response = await fetch(`/api/trips/${trip.tripId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...trip, title: "AI 調整嘉義行程", mutationSource: "ai" }),
      });
      return { status: response.status, title, tripId: trip.tripId, saved: (await response.json()).data };
    });
    expect(created.status).toBe(200);
    await page.reload();
    await expect(page.getByTestId("chat-undo-ai-change")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("chat-active-trip")).toContainText("AI 調整嘉義行程");
    await page.screenshot({ path: info.outputPath("08-ai-change-after-refresh.png"), fullPage: true });
    await page.getByTestId("chat-undo-ai-change").click();
    await expect(page.getByTestId("chat-active-trip")).toContainText(created.title);
    await page.screenshot({ path: info.outputPath("09-ai-change-undone.png"), fullPage: true });
    await page.reload();
    await expect(page.getByTestId("chat-undo-ai-change")).toHaveCount(0);

    const conflict = await page.evaluate(async (tripId) => {
      const bootstrap = await fetch("/api/bootstrap").then((res) => res.json());
      const trip = bootstrap.data.trip;
      const ai = await fetch(`/api/trips/${tripId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...trip, title: "AI 第二次修改", mutationSource: "ai" }) }).then((res) => res.json());
      const subsequent = await fetch(`/api/trips/${tripId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ai.data, title: "手動後續修改", mutationSource: undefined }) });
      const undo = await fetch(`/api/trips/${tripId}/mutations/${ai.data.mutationId}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      return { laterStatus: subsequent.status, undoStatus: undo.status };
    }, created.tripId);
    expect(conflict.laterStatus).toBe(200);
    expect(conflict.undoStatus).toBe(409);

    const renameCas = await page.evaluate(async (tripId) => {
      const snapshot = await fetch("/api/bootstrap").then((res) => res.json());
      const revision = snapshot.data.trip.revision as number;
      const url = `/api/trips/${tripId}`;
      const headers = { "Content-Type": "application/json" };
      const first = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ title: "新標題", revision }) });
      const stale = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ title: "舊版本標題", revision }) });
      const saved = await first.json();
      return { firstStatus: first.status, staleStatus: stale.status, revision: saved.data.revision };
    }, created.tripId);
    expect(renameCas.firstStatus).toBe(200);
    expect(renameCas.staleStatus).toBe(409);
    expect(renameCas.revision).toBeGreaterThan(0);
  });
});
