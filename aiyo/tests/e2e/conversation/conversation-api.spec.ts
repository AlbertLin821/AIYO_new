import { expect, test } from "@playwright/test";

import { loginAs, waitForAuthenticatedSession } from "../helpers/auth";
import {
  buildPersistedTokyoPayload,
  cleanupConversationBaselineData,
  CONVERSATION_USER_A,
  CONVERSATION_USER_B,
  seedConversationBaselineData,
  type ConversationSeed,
} from "../../integration/conversation/fixtures";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

let seed: ConversationSeed;

test.beforeEach(async () => {
  seed = await seedConversationBaselineData();
});

test.afterEach(async () => {
  await cleanupConversationBaselineData();
});

test("bootstrap and current-trip APIs are scoped to the signed-in user", async ({ page }) => {
  await loginAs(page, CONVERSATION_USER_A, "/chat");
  await waitForAuthenticatedSession(page, CONVERSATION_USER_A.email);

  const bootstrapA = await page.request.get("/api/bootstrap");
  expect(bootstrapA.ok()).toBeTruthy();
  const bootstrapPayloadA = (await bootstrapA.json()) as ApiResponse<{
    trip?: { tripId?: string; title?: string; itinerary?: Array<{ items: Array<{ title: string }> }> } | null;
  }>;
  expect(bootstrapPayloadA.data?.trip?.tripId).toBe(seed.currentTripId);
  expect(JSON.stringify(bootstrapPayloadA.data)).toContain("東京四日遊");
  expect(JSON.stringify(bootstrapPayloadA.data)).toContain("明治神宮");

  const currentA = await page.request.get("/api/trips/current");
  expect(currentA.ok()).toBeTruthy();
  const currentPayloadA = (await currentA.json()) as ApiResponse<{ tripId: string | null }>;
  expect(currentPayloadA.data?.tripId).toBe(seed.currentTripId);

  await loginAs(page, CONVERSATION_USER_B, "/chat");
  await waitForAuthenticatedSession(page, CONVERSATION_USER_B.email);

  const bootstrapB = await page.request.get("/api/bootstrap");
  expect(bootstrapB.ok()).toBeTruthy();
  const bootstrapPayloadB = (await bootstrapB.json()) as ApiResponse<unknown>;
  const serializedB = JSON.stringify(bootstrapPayloadB.data);
  expect(serializedB).not.toContain(seed.currentTripId);
  expect(serializedB).not.toContain("東京四日遊");
  expect(serializedB).not.toContain("明治神宮");
  expect(serializedB).not.toContain("淺草寺");

  const currentB = await page.request.get("/api/trips/current");
  expect(currentB.ok()).toBeTruthy();
  const currentPayloadB = (await currentB.json()) as ApiResponse<{ tripId: string | null }>;
  expect(currentPayloadB.data?.tripId).toBeNull();
});

test("current-trip API persists owned payloads and rejects foreign trip writes", async ({ page }) => {
  await loginAs(page, CONVERSATION_USER_A, "/chat");
  await waitForAuthenticatedSession(page, CONVERSATION_USER_A.email);

  const payload = buildPersistedTokyoPayload(seed);
  payload.itinerary[1]!.items.push({
    id: "api-added-asakusa",
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
    id: "api-pin-asakusa",
    name: "淺草寺",
    lat: 35.7148,
    lng: 139.7967,
    linkedTripItemId: "api-added-asakusa",
    dayNumber: 2,
    source: "assistant",
  });

  const saveA = await page.request.put("/api/trips/current", { data: payload });
  expect(saveA.ok()).toBeTruthy();
  const savedA = (await saveA.json()) as ApiResponse<{ itinerary: Array<{ items: Array<{ title: string }> }>; pins: Array<{ name: string }> }>;
  expect(JSON.stringify(savedA.data?.itinerary)).toContain("淺草寺");
  expect(savedA.data?.pins.map((pin) => pin.name)).toContain("淺草寺");

  await loginAs(page, CONVERSATION_USER_B, "/chat");
  await waitForAuthenticatedSession(page, CONVERSATION_USER_B.email);
  const rejectedB = await page.request.put("/api/trips/current", { data: payload });
  expect(rejectedB.ok()).toBeFalsy();
  expect(rejectedB.status()).toBe(403);
  const rejectedPayload = (await rejectedB.json()) as ApiResponse<unknown>;
  expect(rejectedPayload.error?.code).toBe("forbidden");
  expect(JSON.stringify(rejectedPayload)).not.toContain("東京四日遊");
  expect(JSON.stringify(rejectedPayload)).not.toMatch(/stack|prisma|database/i);

  await loginAs(page, CONVERSATION_USER_A, "/chat");
  await waitForAuthenticatedSession(page, CONVERSATION_USER_A.email);
  const bootstrapA = await page.request.get("/api/bootstrap");
  const reloadedA = (await bootstrapA.json()) as ApiResponse<unknown>;
  expect(JSON.stringify(reloadedA.data)).toContain("淺草寺");
});

