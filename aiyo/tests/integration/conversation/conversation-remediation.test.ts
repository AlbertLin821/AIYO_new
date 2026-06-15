import assert from "node:assert/strict";
import test from "node:test";

import { resolveSessionTrip, saveTripPayload, serializeTrip } from "../../../src/server/data/appStateService";
import { prisma } from "../../../src/lib/prisma";
import {
  buildPersistedTokyoPayload,
  cleanupConversationBaselineData,
  seedConversationBaselineData,
  type ConversationSeed,
} from "./fixtures";

let seed: ConversationSeed;

test.before(async () => {
  seed = await seedConversationBaselineData();
});

test.after(async () => {
  await cleanupConversationBaselineData();
  await prisma.$disconnect();
});

async function currentTripSnapshot() {
  const trip = await resolveSessionTrip(seed.userA.id);
  assert.ok(trip, "expected seeded current trip");
  const serialized = serializeTrip(trip);
  return {
    itinerary: serialized.itinerary.map((day) => ({
      dayNumber: day.dayNumber,
      theme: day.theme || "",
      items: day.items.map((item) => ({
        id: item.id,
        title: item.title,
        time: item.time,
        type: item.type,
      })),
    })),
    pins: serialized.pins.map((pin) => ({
      id: pin.id,
      name: pin.name,
      linkedTripItemId: pin.linkedTripItemId || "",
      dayNumber: pin.dayNumber || 0,
    })),
  };
}

test("saveTripPayload rolls back if write fails after deleting old days", async () => {
  const before = await currentTripSnapshot();
  const payload = buildPersistedTokyoPayload(seed);
  payload.itinerary[1]!.items = [];

  await assert.rejects(
    () =>
      saveTripPayload(seed.userA.id, payload, {
        failAfter: "delete_existing_days",
      } as never),
    /injected failure: delete_existing_days/,
  );

  assert.deepEqual(await currentTripSnapshot(), before);
});

test("saveTripPayload rolls back if write fails after creating a new day", async () => {
  const before = await currentTripSnapshot();
  const payload = buildPersistedTokyoPayload(seed);
  payload.itinerary[1]!.theme = "rollback day";

  await assert.rejects(
    () =>
      saveTripPayload(seed.userA.id, payload, {
        failAfter: "create_days",
      } as never),
    /injected failure: create_days/,
  );

  assert.deepEqual(await currentTripSnapshot(), before);
});

test("saveTripPayload rolls back if pins fail after items are created", async () => {
  const before = await currentTripSnapshot();
  const payload = buildPersistedTokyoPayload(seed);
  payload.itinerary[1]!.items.push({
    id: "rollback-added-asakusa",
    dayNumber: 2,
    time: "16:30",
    title: "淺草寺",
    type: "attraction",
  });
  payload.pins.push({
    id: "rollback-pin-asakusa",
    name: "淺草寺",
    lat: 35.7148,
    lng: 139.7967,
    linkedTripItemId: "rollback-added-asakusa",
    dayNumber: 2,
    source: "assistant",
  });

  await assert.rejects(
    () =>
      saveTripPayload(seed.userA.id, payload, {
        failAfter: "create_items",
      } as never),
    /injected failure: create_items/,
  );

  assert.deepEqual(await currentTripSnapshot(), before);
});

test("saveTripPayload commits all days items pins together when no failure occurs", async () => {
  const payload = buildPersistedTokyoPayload(seed);
  payload.itinerary[1]!.items.push({
    id: "transaction-added-asakusa",
    dayNumber: 2,
    time: "16:30",
    title: "淺草寺",
    type: "attraction",
    location: {
      name: "淺草寺",
      lat: 35.7148,
      lng: 139.7967,
      description: "淺草寺",
    },
  });
  payload.pins.push({
    id: "transaction-pin-asakusa",
    name: "淺草寺",
    lat: 35.7148,
    lng: 139.7967,
    linkedTripItemId: "transaction-added-asakusa",
    dayNumber: 2,
    source: "assistant",
  });

  const saved = await saveTripPayload(seed.userA.id, payload);
  assert.equal(saved.itinerary[1]?.items.some((item) => item.title === "淺草寺"), true);
  assert.equal(saved.pins.some((pin) => pin.linkedTripItemId === "transaction-added-asakusa"), true);
});
