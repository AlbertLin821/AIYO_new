import assert from "node:assert/strict";
import test from "node:test";

import { validateAssistantActions } from "../../../src/server/ai/assistantActionValidator";
import { buildPersonalizedAIContext } from "../../../src/server/ai/aiContextBuilder";
import { loadAuthorizedChatContext, resolveAuthorizedChatTripContext } from "../../../src/server/ai/chatTripContext";
import { resolveSessionTrip, saveTripPayload } from "../../../src/server/data/appStateService";
import { requireTripAccess } from "../../../src/server/tripAccess";
import { executeTravelToolRequests } from "../../../src/server/services/travelResearchTools";
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

test("collaborator reads the selected trip while an unrelated user remains isolated", async () => {
  await assert.rejects(() => loadAuthorizedChatContext(seed.userB.id, seed.currentTripId), /forbidden/);
  const collaborator = await prisma.tripCollaborator.create({ data: { tripId: seed.currentTripId, userId: seed.userB.id, role: "editor" } });
  try {
    const context = await loadAuthorizedChatContext(seed.userB.id, seed.currentTripId, { destination: "大阪", itinerary: [] });
    assert.equal(context.destination, "東京");
    assert.ok(context.itinerary?.some((day) => day.items.length > 0));
    const personalized = await buildPersonalizedAIContext({ userId: seed.userB.id, tripId: seed.currentTripId });
    assert.equal(personalized.structuredContext.currentTrip?.id, seed.currentTripId);
  } finally {
    await prisma.tripCollaborator.delete({ where: { id: collaborator.id } });
  }
});

test("chat without an explicit trip ID does not guess the active trip", async () => {
  const draftContext = {
    destination: "大阪",
    itinerary: [{ dayNumber: 1, items: [{ id: "browser-only", time: "09:00", title: "錯誤的瀏覽器行程", type: "activity" }] }],
  } as const;
  const unbound = await resolveAuthorizedChatTripContext(seed.userA.id, undefined, draftContext);
  assert.equal(unbound.tripId, undefined);
  assert.equal(unbound.context?.destination, "大阪");
  const bound = await resolveAuthorizedChatTripContext(seed.userA.id, seed.currentTripId, draftContext);
  assert.equal(bound.tripId, seed.currentTripId);
  assert.equal(bound.context?.destination, "東京");
  assert.ok(bound.context?.itinerary?.some((day) => day.items.some((item) => item.title === "上野公園")));
  assert.ok(!bound.context?.itinerary?.some((day) => day.items.some((item) => item.id === "browser-only")));
  await assert.rejects(() => resolveAuthorizedChatTripContext(seed.userB.id, seed.currentTripId), /forbidden/);
});

test("nearby search uses a verified place saved in the authorized trip", async () => {
  const itemId = seed.itemIds.day1UenoPark;
  const before = await prisma.tripItem.findUniqueOrThrow({ where: { id: itemId }, select: { latitude: true, longitude: true, verified: true } });
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  await prisma.tripItem.update({ where: { id: itemId }, data: { latitude: 35.7156, longitude: 139.7745, verified: true } });
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    return new Response(JSON.stringify({ elements: [{ type: "node", id: 456, lat: 35.716, lon: 139.775, tags: { name: "上野餐廳", amenity: "restaurant" } }] }), { status: 200 });
  };
  try {
    const context = await buildPersonalizedAIContext({ userId: seed.userA.id, tripId: seed.currentTripId });
    const result = await executeTravelToolRequests([
      { type: "search_nearby_places", anchor: "上野公園", category: "restaurant", radius: 1500 },
    ], { destination: "東京" }, undefined, context.structuredContext);
    assert.equal(result.placeHits[0]?.name, "上野餐廳");
    assert.ok(urls.length > 0 && urls.every((url) => !url.includes("/api?")));
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.tripItem.update({ where: { id: itemId }, data: before });
  }
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

test("AI snapshot is durable and a stale revision cannot overwrite a later edit", async () => {
  const original = buildPersistedTokyoPayload(seed);
  const current = await prisma.trip.findUniqueOrThrow({ where: { id: seed.currentTripId }, select: { revision: true } });
  const aiPayload = { ...original, revision: current.revision, mutationSource: "ai" as const, title: "AI 調整後的東京行程" };
  const saved = await saveTripPayload(seed.userA.id, aiPayload);
  assert.ok(saved.mutationId);
  const mutation = await prisma.tripMutation.findUniqueOrThrow({ where: { id: saved.mutationId! } });
  assert.equal(mutation.baseRevision, current.revision);
  assert.equal(mutation.resultRevision, saved.revision);
  assert.equal((mutation.beforeSnapshot as { revision: number }).revision, current.revision);
  await assert.rejects(() => saveTripPayload(seed.userA.id, aiPayload), /version_conflict/);
  const later = await saveTripPayload(seed.userA.id, { ...saved, title: "後續手動修改", revision: saved.revision, mutationSource: undefined });
  await assert.rejects(() => saveTripPayload(seed.userA.id, { ...(mutation.beforeSnapshot as unknown as typeof original), revision: saved.revision }), /version_conflict/);
  assert.equal((await prisma.trip.findUniqueOrThrow({ where: { id: seed.currentTripId } })).title, later.title);
});

test("AI snapshot can restore the prior trip without losing item and pin links", async () => {
  const before = buildPersistedTokyoPayload(seed);
  const current = await prisma.trip.findUniqueOrThrow({ where: { id: seed.currentTripId }, select: { revision: true } });
  const ai = await saveTripPayload(seed.userA.id, { ...before, revision: current.revision, mutationSource: "ai", title: "暫時修改" });
  const record = await prisma.tripMutation.findUniqueOrThrow({ where: { id: ai.mutationId! } });
  const restored = await saveTripPayload(seed.userA.id, { ...(record.beforeSnapshot as unknown as typeof before), tripId: seed.currentTripId, revision: ai.revision });
  assert.equal(restored.revision, ai.revision! + 1);
  assert.equal(restored.title, (record.beforeSnapshot as { title: string }).title);
  for (const pin of restored.pins) {
    if (pin.linkedTripItemId) assert.ok(restored.itinerary.some((day) => day.items.some((item) => item.id === pin.linkedTripItemId)));
  }
});

