import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { recordVideoInteraction, resolveOwnedTripId } from "@/server/personalization/personalizationService";

test("resolveOwnedTripId rejects trips not owned by the current user", async () => {
  const original = prisma.trip.findFirst;
  Object.assign(prisma.trip, { findFirst: async () => null });

  await assert.rejects(
    () => resolveOwnedTripId("user_1", "trip_other"),
    /trip_not_owned/,
  );
  Object.assign(prisma.trip, { findFirst: original });
});

test("recordVideoInteraction refuses to bind a video to another user's trip", async () => {
  const originalFindFirst = prisma.trip.findFirst;
  const originalExecuteRaw = prisma.$executeRaw;
  let executeCalls = 0;
  Object.assign(prisma.trip, {
    findFirst: async (args: unknown) => {
      assert.deepEqual((args as { where: unknown }).where, { id: "trip_other", userId: "user_1" });
      return null;
    },
  });
  Object.assign(prisma, {
    $executeRaw: async () => {
      executeCalls += 1;
      return 1;
    },
  });

  await assert.rejects(
    () =>
      recordVideoInteraction("user_1", {
        tripId: "trip_other",
        videoId: "video_1",
        interactionType: "watch",
      }),
    /trip_not_owned/,
  );
  assert.equal(executeCalls, 0);
  Object.assign(prisma.trip, { findFirst: originalFindFirst });
  Object.assign(prisma, { $executeRaw: originalExecuteRaw });
});
