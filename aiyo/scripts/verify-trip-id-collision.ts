import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadProjectEnvIntoProcess } from "../src/lib/projectEnv";
loadProjectEnvIntoProcess(process.cwd(), { override: false });
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.hostname = "127.0.0.1";
  process.env.DATABASE_URL = url.toString();
}
async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { saveTripPayload } = await import("../src/server/data/appStateService");
  const user = await prisma.user.create({ data: { email: `collision-${randomUUID()}@example.invalid` } });
  try {
    const trips = await Promise.all([1, 2].map(() => prisma.trip.create({ data: { userId: user.id, title: "Collision verification", days: 1 } })));
    const itemId = randomUUID();
    const pinId = randomUUID();
    const payload = {
      title: "Collision verification", destination: "台南", days: 1, updatedAt: new Date().toISOString(),
      itinerary: [{ dayNumber: 1, theme: "Day 1", items: [{ id: itemId, dayNumber: 1, title: "赤崁樓", time: "10:00", type: "attraction" as const, source: "manual" as const }] }],
      pins: [{ id: pinId, linkedTripItemId: itemId, name: "赤崁樓", lat: 22.9972, lng: 120.2023, description: "Verification", source: "manual" as const }],
    };
    const first = await saveTripPayload(user.id, { ...payload, tripId: trips[0].id });
    const second = await saveTripPayload(user.id, { ...payload, tripId: trips[1].id });
    assert.equal(second.tripId, trips[1].id);
    assert.equal(second.itinerary[0].items.length, 1);
    assert.notEqual(second.itinerary[0].items[0].id, first.itinerary[0].items[0].id);
    assert.ok(second.pins.some(pin => pin.linkedTripItemId === second.itinerary[0].items[0].id));
    assert.equal(await prisma.tripItem.count({ where: { tripId: trips[0].id } }), 1);
    console.info("PASS: cross-trip ID collision preserves both trips, activities and pin links");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
