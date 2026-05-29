import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { buildPersonalizedAIContext } from "@/server/ai/aiContextBuilder";

const now = new Date("2026-05-30T00:00:00.000Z");

function mockBasePrisma(options?: {
  currentTripOwned?: boolean;
  empty?: boolean;
  globalMessageCount?: number;
}) {
  const calls: { rawValues: unknown[][]; tripFindFirstArgs: unknown[] } = {
    rawValues: [],
    tripFindFirstArgs: [],
  };
  const originals = {
    userFindUnique: prisma.user.findUnique,
    userFindUniqueOrThrow: prisma.user.findUniqueOrThrow,
    tripFindFirst: prisma.trip.findFirst,
    tripFindMany: prisma.trip.findMany,
    chatMessageFindMany: prisma.chatMessage.findMany,
    queryRaw: prisma.$queryRaw,
  };
  const currentTrip = options?.currentTripOwned === false
    ? null
    : {
        id: "trip_1",
        userId: "user_1",
        title: "東京三天",
        destination: "東京",
        days: 3,
        itineraryDays: [
          { id: "day_1", dayNumber: 1, summary: null, sortOrder: 0 },
          { id: "day_2", dayNumber: 2, summary: null, sortOrder: 1 },
        ],
        items: [
          {
            id: "item_1",
            day: 1,
            title: "淺草寺",
            location: "淺草寺",
            timeSlot: "09:00",
            description: "上午散步",
            itemType: "attraction",
            order: 0,
          },
          {
            id: "item_2",
            day: 2,
            title: "秋葉原",
            location: "秋葉原",
            timeSlot: "14:00",
            description: "購物",
            itemType: "shopping",
            order: 0,
          },
        ],
      };

  const mockedUser = {
    id: "user_1",
    email: "user@example.com",
    name: "User",
    profile: options?.empty
      ? { preferences: {}, budget: null, destination: null }
      : {
          preferences: {
            interests: ["food", "shopping"],
            preferredTransport: "Transit",
            pace: "relaxed",
            avoid: ["太趕"],
          },
          budget: 45000,
          destination: "東京",
        },
  };
  Object.assign(prisma.user, {
    findUnique: async () => mockedUser,
    findUniqueOrThrow: async () => mockedUser,
  });

  Object.assign(prisma.trip, {
    findFirst: async (args: unknown) => {
      calls.tripFindFirstArgs.push(args);
      const where = (args as { where?: { id?: string; userId?: string } }).where;
      if (where?.id) {
        return where.id === "trip_1" && where.userId === "user_1" ? currentTrip : null;
      }
      return options?.empty
        ? null
        : {
            id: "latest_trip",
            destination: "大阪",
            days: 2,
            title: "大阪週末",
            updatedAt: now,
            items: [{ title: "道頓堀" }],
          };
    },
    findMany: async () =>
      options?.empty
        ? []
        : [
            {
              id: "trip_1",
              destination: "東京",
              days: 3,
              title: "東京三天",
              createdAt: now,
              items: [{ title: "淺草寺", itemType: "attraction", day: 1 }],
            },
          ],
  });

  Object.assign(prisma.chatMessage, {
    findMany: async (args: unknown) => {
      if (options?.empty) {
        return [];
      }
      const where = (args as { where?: { tripId?: string | null } }).where;
      if (where?.tripId === "trip_1") {
        return [
          { role: "user", content: "想保留購物時間", createdAt: now },
          { role: "assistant", content: "可以安排秋葉原", createdAt: now },
        ];
      }
      const count = options?.globalMessageCount ?? 3;
      return Array.from({ length: count }, (_, index) => ({
        role: index % 2 ? "assistant" : "user",
        content: `全域聊天 ${index}`,
        createdAt: now,
        metadata: index === 0 ? { tripId: "deleted_trip" } : {},
      }));
    },
  });

  Object.assign(prisma, {
    $queryRaw: async (...args: unknown[]) => {
      calls.rawValues.push(args.slice(1));
      const sql = Array.isArray(args[0]) ? (args[0] as string[]).join(" ") : "";
      if (options?.empty) {
        return [];
      }
      if (sql.includes("video_interactions")) {
        return [
          {
            videoId: "video_1",
            title: "東京美食",
            source: "youtube",
            interactionType: "analyze",
            createdAt: now,
            tripId: "trip_1",
            extractedPlaces: ["晴空塔", "淺草"],
            extractedTimestamps: [{ label: "晴空塔", timestamp: "01:20", seconds: 80 }],
          },
        ];
      }
      return [
        {
          videoId: "video_1",
          title: "東京美食",
          appliedAt: now,
          tripId: "trip_1",
          summarySnapshot: { summary: "晴空塔與淺草路線" },
          appliedPlaces: ["晴空塔"],
          appliedSegments: ["01:20 晴空塔"],
          createdTripItems: ["晴空塔"],
        },
      ];
    },
  });

  return {
    ...calls,
    restore() {
      Object.assign(prisma.user, {
        findUnique: originals.userFindUnique,
        findUniqueOrThrow: originals.userFindUniqueOrThrow,
      });
      Object.assign(prisma.trip, {
        findFirst: originals.tripFindFirst,
        findMany: originals.tripFindMany,
      });
      Object.assign(prisma.chatMessage, {
        findMany: originals.chatMessageFindMany,
      });
      Object.assign(prisma, {
        $queryRaw: originals.queryRaw,
      });
    },
  };
}

test("AIContextBuilder includes only an owned current trip with days and items", async () => {
  const mocks = mockBasePrisma();

  const context = await buildPersonalizedAIContext({ userId: "user_1", tripId: "trip_1" });

  assert.equal(context.structuredContext.currentTrip?.id, "trip_1");
  assert.equal(context.structuredContext.currentTrip?.days[0]?.items[0]?.title, "淺草寺");
  assert.ok(context.debug.includedSources.includes("current_trip_context"));
  mocks.restore();
});

test("AIContextBuilder excludes a trip that is not owned by current user", async () => {
  const calls = mockBasePrisma({ currentTripOwned: false });

  const context = await buildPersonalizedAIContext({ userId: "user_1", tripId: "other_trip" });

  assert.equal(context.structuredContext.currentTrip, undefined);
  assert.ok(context.structuredContext.contextWarnings.some((warning) => warning.includes("tripId")));
  assert.deepEqual(
    (calls.tripFindFirstArgs[1] as { where: { id: string; userId: string } }).where,
    { id: "other_trip", userId: "user_1" },
  );
  calls.restore();
});

test("AIContextBuilder queries video interactions scoped to current user", async () => {
  const calls = mockBasePrisma();

  const context = await buildPersonalizedAIContext({ userId: "user_1" });

  assert.equal(context.structuredContext.videoInteractions[0]?.videoId, "video_1");
  assert.ok(calls.rawValues.every((values) => values.includes("user_1")));
  calls.restore();
});

test("AIContextBuilder without tripId still includes preferences, recent trips, and videos", async () => {
  const mocks = mockBasePrisma();

  const context = await buildPersonalizedAIContext({ userId: "user_1" });

  assert.equal(context.structuredContext.currentTrip, undefined);
  assert.equal(context.structuredContext.preferences.budgetLevel, "medium");
  assert.equal(context.structuredContext.recentTrips[0]?.destination, "東京");
  assert.equal(context.structuredContext.videoInteractions[0]?.title, "東京美食");
  mocks.restore();
});

test("AIContextBuilder caps global chat memory and filters deleted-trip candidates", async () => {
  const mocks = mockBasePrisma({ globalMessageCount: 20 });

  const context = await buildPersonalizedAIContext({ userId: "user_1" });

  assert.ok(context.structuredContext.globalChatMemory.length <= 8);
  assert.ok(context.structuredContext.contextWarnings.some((warning) => warning.includes("舊行程")));
  mocks.restore();
});

test("AIContextBuilder after personalization cleanup returns no optional memories", async () => {
  const mocks = mockBasePrisma({ empty: true });

  const context = await buildPersonalizedAIContext({ userId: "user_1" });

  assert.deepEqual(context.structuredContext.recentTrips, []);
  assert.deepEqual(context.structuredContext.videoInteractions, []);
  assert.deepEqual(context.structuredContext.appliedVideoSummaries, []);
  assert.equal(context.structuredContext.preferences.destinationPreferences?.length ?? 0, 0);
  assert.doesNotMatch(context.promptContextText, /東京美食|晴空塔|全域聊天|想保留購物時間/);
  mocks.restore();
});
