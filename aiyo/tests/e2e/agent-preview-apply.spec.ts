import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { planAgentPreview } from "@/server/agent/previewPlanner";
import { serializeTrip } from "@/server/data/appStateService";
import { loginAs } from "./helpers/auth";
import { E2E_COLLABORATOR, E2E_OWNER, resetE2EData, seedAuthUsers, seedTripForUser } from "./helpers/db";

let tripId: string;
let ownerId: string;
let collaboratorId: string;

test.describe("agent preview apply", () => {
  test.beforeAll(async () => {
    await resetE2EData();
    const { owner, collaborator } = await seedAuthUsers();
    ownerId = owner.id;
    collaboratorId = collaborator.id;
    const trip = await seedTripForUser(owner.id);
    tripId = trip.id;
  });
  test.afterAll(async () => { await resetE2EData(); });

  test("commits once, preserves revision and rejects a stale replay", async ({ page }) => {
    const hydrationSave = page.waitForResponse((response) => response.url().includes("/api/trips/current") && response.request().method() === "PUT", { timeout: 12_000 }).catch(() => null);
    await loginAs(page, E2E_OWNER, "/itinerary");
    await hydrationSave;
    const full = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { itineraryDays: true, items: true, pins: true } });
    const removedItemId = full.items[0].id;
    const proposal = { version: 1 as const, explanation: "移除景點", operations: [{ type: "remove_item" as const, itemId: removedItemId }] };
    const result = planAgentPreview(serializeTrip(full), proposal, new Map());
    const preview = await prisma.agentPreview.create({ data: {
      tripId, actorId: ownerId, baseRevision: full.revision, expiresAt: new Date(Date.now() + 60_000),
      proposalJson: JSON.parse(JSON.stringify({ proposal, resultTrip: result.trip, changes: result.changes, warnings: result.warnings })),
    } });
    const url = `/api/trips/${tripId}/agent/apply`;
    const body = { previewId: preview.id, baseRevision: full.revision, idempotencyKey: randomUUID() };
    const [first, concurrentRetry] = await Promise.all([
      page.request.post(url, { data: body }),
      page.request.post(url, { data: body }),
    ]);
    expect(first.status()).toBe(200);
    const firstPayload = await first.json();
    expect(concurrentRetry.status(), await concurrentRetry.text()).toBe(200);
    expect((await concurrentRetry.json()).data.mutationId).toBe(firstPayload.data.mutationId);
    expect(firstPayload.data.revision).toBe(full.revision + 1);
    const saved = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { items: true, pins: true } });
    expect(saved.items.some((item) => item.id === removedItemId)).toBe(false);
    expect(saved.revision).toBe(full.revision + 1);
    const events = await page.request.get(`/api/trips/${tripId}/events?afterRevision=${full.revision}`);
    expect(events.status()).toBe(200);
    const eventPayload = (await events.json()).data;
    expect(eventPayload.gap).toBe(false);
    expect(eventPayload.events).toMatchObject([{ resultRevision: full.revision + 1, source: "agent" }]);
    expect(eventPayload.snapshot).toBeNull();
    const retry = await page.request.post(url, { data: body });
    expect(retry.status()).toBe(200);
    expect((await retry.json()).data.mutationId).toBe(firstPayload.data.mutationId);
    const stale = await page.request.post(url, { data: { previewId: preview.id, baseRevision: full.revision, idempotencyKey: randomUUID() } });
    expect(stale.status()).toBe(410);
    expect(await prisma.tripMutation.count({ where: { tripId, source: "agent" } })).toBe(1);

    const undoUrl = `/api/trips/${tripId}/mutations/execute`;
    const undoBody = { action: "undo", mutationId: firstPayload.data.mutationId, baseRevision: full.revision + 1, idempotencyKey: randomUUID() };
    const [undone, duplicateUndo] = await Promise.all([
      page.request.post(undoUrl, { data: undoBody }),
      page.request.post(undoUrl, { data: undoBody }),
    ]);
    expect(undone.status()).toBe(200);
    expect((await undone.json()).data.revision).toBe(full.revision + 2);
    expect(await prisma.tripItem.findUnique({ where: { id: removedItemId } })).not.toBeNull();
    expect(duplicateUndo.status()).toBe(200);

    const redoUrl = `/api/trips/${tripId}/mutations/execute`;
    const redoBody = { action: "redo", mutationId: firstPayload.data.mutationId, baseRevision: full.revision + 2, idempotencyKey: randomUUID() };
    const [redone, duplicateRedo] = await Promise.all([
      page.request.post(redoUrl, { data: redoBody }),
      page.request.post(redoUrl, { data: redoBody }),
    ]);
    expect(redone.status()).toBe(200);
    expect((await redone.json()).data.revision).toBe(full.revision + 3);
    expect(duplicateRedo.status()).toBe(200);
    expect(await prisma.tripItem.findUnique({ where: { id: removedItemId } })).toBeNull();
    const reusedKey = await page.request.post(redoUrl, { data: { ...redoBody, idempotencyKey: undoBody.idempotencyKey } });
    expect(reusedKey.status()).toBe(409);

    await prisma.tripCollaborator.create({ data: { tripId, userId: collaboratorId, role: "viewer" } });
    await loginAs(page, E2E_COLLABORATOR, "/itinerary");
    const viewerApply = await page.request.post(url, { data: { previewId: preview.id, baseRevision: full.revision + 3, idempotencyKey: randomUUID() } });
    expect(viewerApply.status()).toBe(403);
    const viewerUndo = await page.request.post(undoUrl, { data: { action: "undo", mutationId: firstPayload.data.mutationId, baseRevision: full.revision + 3, idempotencyKey: randomUUID() } });
    expect(viewerUndo.status()).toBe(403);
  });

  test("recalculates a verified place preview when its time changes", async ({ page }, info) => {
    const trip = await seedTripForUser(ownerId, "E2E 預覽調整行程");
    await loginAs(page, E2E_OWNER, "/itinerary");
    expect((await page.request.post("/api/trips/active", { data: { tripId: trip.id } })).status()).toBe(200);
    const hydrationSave = page.waitForResponse((response) => response.url().includes("/api/trips/current") && response.request().method() === "PUT", { timeout: 12_000 }).catch(() => null);
    await page.goto("/chat");
    await hydrationSave;
    await expect(page.getByTestId("chat-active-trip")).toContainText("E2E 預覽調整行程");
    const full = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { itineraryDays: true, items: true, pins: true } });
    const day = serializeTrip(full).itinerary[0];
    const place = { id: "fixture:adjusted", title: "臺南市美術館二館", location: { name: "臺南市美術館二館", lat: 22.9908, lng: 120.203, description: "", resolvedFrom: "user" as const, verified: true } };
    const proposal = { version: 1 as const, explanation: "加入博物館", operations: [{ type: "add_item" as const, day: day.dayNumber, placeId: place.id, time: "14:00", afterItemId: day.items[0].id }] };
    const planned = planAgentPreview(serializeTrip(full), proposal, new Map([[place.id, place]]));
    const preview = await prisma.agentPreview.create({ data: {
      tripId: trip.id, actorId: ownerId, baseRevision: full.revision, expiresAt: new Date(Date.now() + 180_000),
      proposalJson: JSON.parse(JSON.stringify({ proposal, places: [place], resultTrip: planned.trip, changes: planned.changes, warnings: planned.warnings })),
    } });
    const heldHydration = await page.request.put("/api/trips/current", { data: { ...serializeTrip(full), title: "不應由背景補全覆蓋", mutationSource: "hydration" } });
    expect(heldHydration.status(), await heldHydration.text()).toBe(200);
    expect((await heldHydration.json()).data.revision).toBe(full.revision);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).title).toBe(trip.title);
    const previewLoads: Array<{ status: number; body: string }> = [];
    page.on("response", async (response) => {
      if (response.url().endsWith(`/api/trips/${trip.id}/agent/preview/latest`)) previewLoads.push({ status: response.status(), body: await response.text().catch(() => "") });
    });
    await page.locator('a[href="/itinerary"]').first().click();
    await page.locator('a[href="/chat"]').first().click();
    const card = page.getByTestId("agent-change-preview");
    const persistedPreview = await page.request.get(`/api/trips/${trip.id}/agent/preview/latest`);
    expect(persistedPreview.status(), await persistedPreview.text()).toBe(200);
    expect((await persistedPreview.json()).data.preview?.previewId).toBe(preview.id);
    await expect.poll(() => previewLoads.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const url = `/api/trips/${trip.id}/agent/preview/${preview.id}/time`;
    const invalid = await page.request.post(url, { data: { operationIndex: 0, time: "25:70" } });
    expect(invalid.status()).toBe(400);
    const conflict = await page.request.post(url, { data: { operationIndex: 0, time: "09:00" } });
    expect(conflict.status()).toBe(422);
    const adjustedResponse = page.waitForResponse((response) => response.url().endsWith(url) && response.request().method() === "POST");
    await card.getByLabel("臺南市美術館二館時間").fill("15:30");
    const adjusted = await adjustedResponse;
    expect(adjusted.status(), await adjusted.text()).toBe(200);
    const payload = (await adjusted.json()).data;
    expect(payload.changes[0].after.time).toBe("15:30");
    expect(payload.ui.components.some((component: { actionId: string; props: { time?: string } }) => component.actionId === "time_0" && component.props.time === "15:30")).toBe(true);
    const placeUrl = `/api/trips/${trip.id}/agent/preview/${preview.id}/place`;
    const blankPlace = await page.request.post(placeUrl, { data: { operationIndex: 0, query: " " } });
    expect(blankPlace.status()).toBe(400);
    await card.getByPlaceholder("輸入另一個景點或店家名稱").fill("安平古堡");
    const changedPlaceResponse = page.waitForResponse((response) => response.url().endsWith(placeUrl) && response.request().method() === "POST");
    await card.getByRole("button", { name: "查證並替換" }).click();
    const changedPlace = await changedPlaceResponse;
    expect(changedPlace.status(), await changedPlace.text()).toBe(200);
    const changedPayload = (await changedPlace.json()).data;
    expect(changedPayload.changes[0].after.title).toContain("安平古堡");
    expect(changedPayload.summary).toContain("安平古堡");
    expect(changedPayload.changes[0].after.time).toBe("15:30");
    expect(changedPayload.ui.components.some((component: { actionId: string }) => component.actionId === "place_0")).toBe(true);
    await expect(card).toContainText("安平古堡");
    await expect(card.getByRole("link", { name: "查看來源" })).toHaveAttribute("href", /openstreetmap\.org\/(node|way|relation)\/\d+/);
    await page.screenshot({ path: info.outputPath("adjusted-preview-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("aside").first()).toBeHidden();
    await expect(page.locator("main").first()).toHaveCSS("margin-left", "0px");
    await expect(card.getByRole("button", { name: "確認套用" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("adjusted-preview-mobile.png"), fullPage: true });
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).revision).toBe(full.revision);
    const applyResponse = page.waitForResponse((response) => response.url().endsWith(`/api/trips/${trip.id}/agent/apply`) && response.request().method() === "POST");
    await card.getByRole("button", { name: "確認套用" }).click();
    const apply = await applyResponse;
    expect(apply.status(), await apply.text()).toBe(200);
    const saved = await prisma.tripItem.findFirstOrThrow({ where: { tripId: trip.id, title: { contains: "安平古堡" } } });
    expect(saved.timeSlot).toBe("15:30");
    const afterApply = await page.request.post(url, { data: { operationIndex: 0, time: "16:00" } });
    expect(afterApply.status()).toBe(409);
  });
});
