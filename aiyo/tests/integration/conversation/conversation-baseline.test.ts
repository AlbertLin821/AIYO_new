import assert from "node:assert/strict";
import test from "node:test";

import { validateAssistantActions } from "../../../src/server/ai/assistantActionValidator";
import { buildPersonalizedAIContext } from "../../../src/server/ai/aiContextBuilder";
import { resolveSessionTrip, saveTripPayload } from "../../../src/server/data/appStateService";
import { requireTripAccess } from "../../../src/server/tripAccess";
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

test("AI context includes User A memories/preferences and excludes unsupported facts", async () => {
  const context = await buildPersonalizedAIContext({
    userId: seed.userA.id,
    currentUserInput: "我之前去過哪裡？",
    tripId: seed.currentTripId,
  });

  assert.match(context.promptContextText, /東京/);
  assert.match(context.promptContextText, /京都/);
  assert.match(context.promptContextText, /淺草寺/);
  assert.match(context.promptContextText, /清水寺/);
  assert.match(context.promptContextText, /拉麵|寺廟|歷史建築/);
  assert.doesNotMatch(context.promptContextText, /大阪/);
  assert.doesNotMatch(context.promptContextText, /最喜歡的餐廳/u);
});

test("User B context cannot see User A trips, preferences, or chat memory", async () => {
  const context = await buildPersonalizedAIContext({
    userId: seed.userB.id,
    currentUserInput: "我之前去過哪裡？",
  });

  assert.doesNotMatch(context.promptContextText, /東京四日遊/);
  assert.doesNotMatch(context.promptContextText, /淺草寺|明治神宮|清水寺/);
  assert.doesNotMatch(context.promptContextText, /拉麵|寺廟|歷史建築/);
  assert.equal(context.structuredContext.recentTrips.length, 0);
});

test("AssistantAction validation accepts owned updates and rejects foreign or unsafe actions", async () => {
  const context = await buildPersonalizedAIContext({
    userId: seed.userA.id,
    currentUserInput: "把第二天的明治神宮改到下午三點",
    tripId: seed.currentTripId,
  });
  const valid = validateAssistantActions({
    userId: seed.userA.id,
    tripId: seed.currentTripId,
    structuredContext: context.structuredContext,
    actions: [
      {
        type: "itinerary.update_item",
        payload: {
          dayId: "day-2",
          itemId: seed.itemIds.day2Meiji,
          patch: { startTime: "15:00" },
        },
      },
    ],
  });

  assert.equal(valid.validActions.length, 1);
  assert.equal(valid.rejectedActions.length, 0);

  const rejected = validateAssistantActions({
    userId: seed.userA.id,
    tripId: seed.currentTripId,
    structuredContext: context.structuredContext,
    actions: [
      {
        type: "itinerary.update_item",
        payload: {
          tripId: "foreign-trip",
          dayId: "day-2",
          itemId: seed.itemIds.day2Meiji,
          patch: { title: "大阪城" },
        },
      },
      {
        type: "itinerary.update_item",
        payload: {
          dayId: "day-2",
          itemId: "missing-item",
          patch: { title: "不存在" },
        },
      },
      {
        type: "itinerary.add_item",
        payload: {
          dayId: "day-2",
          item: { title: "<script>alert(1)</script>" },
        },
      },
    ],
  });

  assert.equal(rejected.validActions.length, 0);
  assert.deepEqual(
    rejected.rejectedActions.map((entry) => entry.reason),
    ["trip does not belong to current user", "itemId does not exist in target day", "dangerous text rejected"],
  );
});

test("trip persistence updates DB and reload payload without leaking to User B", async () => {
  const payload = buildPersistedTokyoPayload(seed);
  payload.itinerary[1]!.items.push({
    id: "qa-added-asakusa",
    dayNumber: 2,
    time: "16:30",
    title: "淺草寺",
    type: "attraction",
    location: {
      name: "淺草寺",
      lat: 35.7148,
      lng: 139.7967,
      description: "淺草寺",
      address: "東京都台東區",
    },
  });
  payload.pins.push({
    id: "qa-pin-asakusa",
    name: "淺草寺",
    lat: 35.7148,
    lng: 139.7967,
    linkedTripItemId: "qa-added-asakusa",
    dayNumber: 2,
    source: "assistant",
  });

  const saved = await saveTripPayload(seed.userA.id, payload);
  assert.ok(saved.itinerary[1]?.items.some((item) => item.title === "淺草寺"));
  assert.ok(saved.pins.some((pin) => pin.name === "淺草寺"));

  const trip = await resolveSessionTrip(seed.userA.id);
  assert.equal(trip?.id, seed.currentTripId);
  const dbItem = await prisma.tripItem.findFirst({
    where: { tripId: seed.currentTripId, title: "淺草寺" },
  });
  const dbPin = await prisma.mapPin.findFirst({
    where: { tripId: seed.currentTripId, label: "淺草寺" },
  });
  assert.equal(dbItem?.day, 2);
  assert.equal(dbPin?.linkedTripItemId, "qa-added-asakusa");

  await assert.rejects(() => requireTripAccess(seed.userB.id, seed.currentTripId, "edit"), /forbidden/);
  await assert.rejects(() => saveTripPayload(seed.userB.id, payload), /forbidden/);
});

