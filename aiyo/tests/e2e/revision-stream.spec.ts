import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { serializeTrip } from "@/server/data/appStateService";
import { loginAs } from "./helpers/auth";
import { E2E_COLLABORATOR, E2E_OWNER, resetE2EData, seedAuthUsers, seedTripForUser } from "./helpers/db";

test("editor receives revision events and reconnects with a current snapshot", async ({ page, browser }) => {
  await resetE2EData();
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  try {
    const { owner, collaborator } = await seedAuthUsers();
    const trip = await seedTripForUser(owner.id);
    const room = await prisma.collaborationRoom.findUniqueOrThrow({ where: { tripId: trip.id } });
    await loginAs(editorPage, E2E_COLLABORATOR, "/itinerary");
    const denied = await editorPage.request.get(`/api/realtime/stream?roomId=${room.id}`);
    expect(denied.status()).toBe(403);

    await prisma.tripCollaborator.create({ data: { tripId: trip.id, userId: collaborator.id, role: "editor" } });
    await loginAs(page, E2E_OWNER, "/itinerary");
    expect((await page.request.post("/api/trips/active", { data: { tripId: trip.id } })).status()).toBe(200);
    expect((await editorPage.request.post("/api/trips/active", { data: { tripId: trip.id } })).status()).toBe(200);
    await editorPage.goto("/itinerary");
    await editorPage.evaluate((roomId) => {
      const state = window as typeof window & { __revisionEvents?: number[]; __snapshotRevision?: number; __revisionSource?: EventSource };
      state.__revisionEvents = [];
      state.__revisionSource = new EventSource(`/api/realtime/stream?roomId=${roomId}`);
      state.__revisionSource.addEventListener("revision", (event) => state.__revisionEvents?.push(JSON.parse((event as MessageEvent).data).revision));
      state.__revisionSource.addEventListener("snapshot", (event) => { state.__snapshotRevision = JSON.parse((event as MessageEvent).data).data.trip?.revision; });
    }, room.id);
    await expect.poll(() => editorPage.evaluate(() => (window as typeof window & { __snapshotRevision?: number }).__snapshotRevision)).toBeGreaterThanOrEqual(0);

    const before = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id }, select: { revision: true } });
    const changed = await page.request.patch(`/api/trips/${trip.id}`, { data: { title: "共同修改後的行程", revision: before.revision } });
    expect(changed.status(), await changed.text()).toBe(200);
    const updatedRevision = (await changed.json()).data.revision as number;
    const eventsAfterPatch = await editorPage.request.get(`/api/trips/${trip.id}/events?afterRevision=${before.revision}`);
    expect(eventsAfterPatch.status()).toBe(200);
    const patchRecovery = (await eventsAfterPatch.json()).data;
    expect(patchRecovery.gap).toBe(true);
    expect(patchRecovery.snapshot.revision).toBe(updatedRevision);
    await expect.poll(() => editorPage.evaluate(() => (window as typeof window & { __revisionEvents?: number[] }).__revisionEvents?.at(-1) ?? -1), { timeout: 15_000 }).toBe(updatedRevision);

    await editorPage.evaluate(() => (window as typeof window & { __revisionSource?: EventSource }).__revisionSource?.close());
    for (let index = 0; index < 2; index += 1) {
      const latest = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id }, select: { revision: true } });
      expect((await page.request.patch(`/api/trips/${trip.id}`, { data: { title: `重連後版本 ${index + 1}`, revision: latest.revision } })).status()).toBe(200);
    }
    const final = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id }, select: { revision: true } });
    await editorPage.evaluate((roomId) => {
      const state = window as typeof window & { __snapshotRevision?: number; __revisionSource?: EventSource };
      state.__snapshotRevision = undefined;
      state.__revisionSource = new EventSource(`/api/realtime/stream?roomId=${roomId}`);
      state.__revisionSource.addEventListener("snapshot", (event) => { state.__snapshotRevision = JSON.parse((event as MessageEvent).data).data.trip?.revision; });
    }, room.id);
    await expect.poll(() => editorPage.evaluate(() => (window as typeof window & { __snapshotRevision?: number }).__snapshotRevision ?? -1), { timeout: 15_000 }).toBe(final.revision);
  } finally {
    await editorContext.close();
    await resetE2EData();
  }
});

test("two editors cannot commit the same base revision", async ({ page, browser }) => {
  await resetE2EData();
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  try {
    const { owner, collaborator } = await seedAuthUsers();
    const trip = await seedTripForUser(owner.id);
    await prisma.tripCollaborator.create({ data: { tripId: trip.id, userId: collaborator.id, role: "editor" } });
    await loginAs(page, E2E_OWNER, "/itinerary");
    await loginAs(editorPage, E2E_COLLABORATOR, "/itinerary");
    const before = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { itineraryDays: true, items: true, pins: true } });
    const original = serializeTrip(before);
    const ownerTrip = structuredClone(original);
    const editorTrip = structuredClone(original);
    ownerTrip.itinerary[0].items[0].title = "擁有者的景點";
    editorTrip.itinerary[0].items[0].title = "協作者的景點";
    const [ownerWrite, editorWrite] = await Promise.all([
      page.request.put(`/api/trips/${trip.id}`, { data: ownerTrip }),
      editorPage.request.put(`/api/trips/${trip.id}`, { data: editorTrip }),
    ]);
    expect([ownerWrite.status(), editorWrite.status()].sort()).toEqual([200, 409]);
    const saved = await prisma.trip.findUniqueOrThrow({ where: { id: trip.id }, select: { revision: true, items: true } });
    expect(saved.revision).toBe(before.revision + 1);
    expect(["擁有者的景點", "協作者的景點"]).toContain(saved.items.find((item) => item.id === original.itinerary[0].items[0].id)?.title);
    const recovery = await editorPage.request.get(`/api/trips/${trip.id}/events?afterRevision=${before.revision}`);
    expect(recovery.status()).toBe(200);
    expect((await recovery.json()).data.snapshot.revision).toBe(saved.revision);
  } finally {
    await editorContext.close();
    await resetE2EData();
  }
});
