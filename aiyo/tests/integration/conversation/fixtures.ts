import "./testEnv";
import bcrypt from "bcryptjs";
import { prisma } from "../../../src/lib/prisma";
import type { PersistedTripPayload } from "../../../src/types";

export const CONVERSATION_TEST_PASSWORD = "ConversationTest123!";
export const CONVERSATION_USER_A = {
  email: "qa-conversation-user-a@example.com",
  name: "QA Conversation User A",
  password: CONVERSATION_TEST_PASSWORD,
};
export const CONVERSATION_USER_B = {
  email: "qa-conversation-user-b@example.com",
  name: "QA Conversation User B",
  password: CONVERSATION_TEST_PASSWORD,
};

export type ConversationSeed = {
  userA: { id: string; email: string; password: string };
  userB: { id: string; email: string; password: string };
  currentTripId: string;
  itemIds: {
    day1UenoPark: string;
    day1Ameyoko: string;
    day2Meiji: string;
    day2Shibuya: string;
    day3TokyoStation: string;
  };
};

async function deleteConversationUsers() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: [CONVERSATION_USER_A.email, CONVERSATION_USER_B.email],
      },
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (!userIds.length) {
    return;
  }
  const tripIds = (
    await prisma.trip.findMany({
      where: {
        OR: [{ userId: { in: userIds } }, { collaborators: { some: { userId: { in: userIds } } } }],
      },
      select: { id: true },
    })
  ).map((trip) => trip.id);
  const roomIds = tripIds.length
    ? (
        await prisma.collaborationRoom.findMany({
          where: { tripId: { in: tripIds } },
          select: { id: true },
        })
      ).map((room) => room.id)
    : [];

  await prisma.$transaction([
    prisma.collaborationPresence.deleteMany({
      where: roomIds.length ? { roomId: { in: roomIds } } : { userId: { in: userIds } },
    }),
    prisma.comment.deleteMany({
      where: roomIds.length
        ? { OR: [{ roomId: { in: roomIds } }, { authorId: { in: userIds } }] }
        : { authorId: { in: userIds } },
    }),
    prisma.chatMessage.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tripId: { in: tripIds } }] } }),
    prisma.tripCollaborator.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tripId: { in: tripIds } }] } }),
    prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.account.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.profile.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.itineraryFolder.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
}

export async function cleanupConversationBaselineData() {
  await deleteConversationUsers();
}

export async function seedConversationBaselineData(): Promise<ConversationSeed> {
  await cleanupConversationBaselineData();
  const passwordHash = await bcrypt.hash(CONVERSATION_TEST_PASSWORD, 10);

  const [userA, userB] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: CONVERSATION_USER_A.email,
        name: CONVERSATION_USER_A.name,
        passwordHash,
        profile: {
          create: {
            budget: 50000,
            destination: "東京",
            preferences: {
              interests: ["日本料理", "拉麵", "傳統街區", "寺廟", "歷史建築"],
              travelStyle: ["temples", "history", "ramen"],
              preferredTransport: "public_transport",
              pace: "relaxed",
              budgetLevel: "medium",
              avoid: ["一天過多景點"],
              notes: "喜歡慢步調、大眾運輸、中等預算；不喜歡一天過多景點。",
            },
          },
        },
      },
    }),
    prisma.user.create({
      data: {
        email: CONVERSATION_USER_B.email,
        name: CONVERSATION_USER_B.name,
        passwordHash,
        profile: {
          create: {
            budget: null,
            destination: null,
            preferences: {
              interests: [],
              preferredTransport: "",
            },
          },
        },
      },
    }),
  ]);

  await prisma.trip.create({
    data: {
      userId: userA.id,
      title: "東京歷史旅行回憶",
      destination: "東京",
      days: 3,
      itineraryDays: {
        create: [
          { dayNumber: 1, sortOrder: 0, theme: "淺草", summary: "寺廟與傳統街區" },
          { dayNumber: 2, sortOrder: 1, theme: "上野", summary: "公園散步" },
          { dayNumber: 3, sortOrder: 2, theme: "晴空塔", summary: "展望台" },
        ],
      },
      items: {
        create: [
          { day: 1, order: 0, title: "淺草寺", timeSlot: "09:00", itemType: "attraction", source: "manual", location: "淺草寺" },
          { day: 2, order: 0, title: "上野公園", timeSlot: "10:00", itemType: "attraction", source: "manual", location: "上野公園" },
          { day: 3, order: 0, title: "東京晴空塔", timeSlot: "15:00", itemType: "attraction", source: "manual", location: "東京晴空塔" },
        ],
      },
    },
  });

  await prisma.trip.create({
    data: {
      userId: userA.id,
      title: "京都歷史旅行回憶",
      destination: "京都",
      days: 3,
      itineraryDays: {
        create: [
          { dayNumber: 1, sortOrder: 0, theme: "清水寺", summary: "寺廟" },
          { dayNumber: 2, sortOrder: 1, theme: "伏見稻荷", summary: "神社" },
          { dayNumber: 3, sortOrder: 2, theme: "嵐山", summary: "街區散步" },
        ],
      },
      items: {
        create: [
          { day: 1, order: 0, title: "清水寺", timeSlot: "09:00", itemType: "attraction", source: "manual", location: "清水寺" },
          { day: 2, order: 0, title: "伏見稻荷大社", timeSlot: "10:00", itemType: "attraction", source: "manual", location: "伏見稻荷大社" },
          { day: 3, order: 0, title: "嵐山", timeSlot: "10:00", itemType: "attraction", source: "manual", location: "嵐山" },
        ],
      },
    },
  });

  const currentTrip = await prisma.trip.create({
    data: {
      userId: userA.id,
      title: "東京四日遊",
      destination: "東京",
      days: 4,
      itineraryDays: {
        create: [
          { dayNumber: 1, sortOrder: 0, theme: "上野", summary: "公園與商店街" },
          { dayNumber: 2, sortOrder: 1, theme: "原宿與澀谷", summary: "神社與都會路口" },
          { dayNumber: 3, sortOrder: 2, theme: "東京車站", summary: "車站街區" },
          { dayNumber: 4, sortOrder: 3, theme: "空白", summary: "待安排" },
        ],
      },
      items: {
        create: [
          {
            day: 1,
            order: 0,
            title: "上野公園",
            timeSlot: "09:00",
            itemType: "attraction",
            source: "manual",
            location: "上野公園",
            latitude: 35.7148,
            longitude: 139.773,
          },
          {
            day: 1,
            order: 1,
            title: "阿美橫町",
            timeSlot: "14:00",
            itemType: "shopping",
            source: "manual",
            location: "阿美橫町",
            latitude: 35.7101,
            longitude: 139.7745,
          },
          {
            day: 2,
            order: 0,
            title: "明治神宮",
            timeSlot: "10:00",
            itemType: "attraction",
            source: "manual",
            location: "明治神宮",
            latitude: 35.6764,
            longitude: 139.6993,
          },
          {
            day: 2,
            order: 1,
            title: "澀谷十字路口",
            timeSlot: "15:00",
            itemType: "attraction",
            source: "manual",
            location: "澀谷十字路口",
            latitude: 35.6595,
            longitude: 139.7005,
          },
          {
            day: 3,
            order: 0,
            title: "東京車站",
            timeSlot: "10:00",
            itemType: "transport",
            source: "manual",
            location: "東京車站",
            latitude: 35.6812,
            longitude: 139.7671,
          },
        ],
      },
      pins: {
        create: [
          {
            label: "上野公園",
            lat: 35.7148,
            lng: 139.773,
            linkedTripItemId: undefined,
            dayNumber: 1,
            source: "manual",
            verified: true,
          },
          {
            label: "明治神宮",
            lat: 35.6764,
            lng: 139.6993,
            dayNumber: 2,
            source: "manual",
            verified: true,
          },
        ],
      },
      room: {
        create: {
          inviteCode: `CONV-${Date.now().toString(36).toUpperCase()}`,
        },
      },
    },
    include: {
      items: {
        orderBy: [{ day: "asc" }, { order: "asc" }],
      },
    },
  });

  const itemId = (title: string) => {
    const item = currentTrip.items.find((candidate) => candidate.title === title);
    if (!item) {
      throw new Error(`missing seeded item: ${title}`);
    }
    return item.id;
  };

  await prisma.chatMessage.createMany({
    data: [
      { userId: userA.id, tripId: null, role: "user", content: "我喜歡日本料理、拉麵、傳統街區、寺廟與歷史建築。" },
      { userId: userA.id, tripId: null, role: "assistant", content: "我會記住你的旅遊偏好。" },
      { userId: userA.id, tripId: currentTrip.id, role: "user", content: "目前東京四日遊不要排太趕。" },
    ],
  });

  const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: userA.id } });
  await prisma.profile.update({
    where: { userId: userA.id },
    data: {
      preferences: {
        ...((profile.preferences && typeof profile.preferences === "object" && !Array.isArray(profile.preferences)
          ? profile.preferences
          : {}) as Record<string, unknown>),
        activeTripId: currentTrip.id,
      },
    },
  });

  return {
    userA: { id: userA.id, email: userA.email, password: CONVERSATION_TEST_PASSWORD },
    userB: { id: userB.id, email: userB.email, password: CONVERSATION_TEST_PASSWORD },
    currentTripId: currentTrip.id,
    itemIds: {
      day1UenoPark: itemId("上野公園"),
      day1Ameyoko: itemId("阿美橫町"),
      day2Meiji: itemId("明治神宮"),
      day2Shibuya: itemId("澀谷十字路口"),
      day3TokyoStation: itemId("東京車站"),
    },
  };
}

export function buildPersistedTokyoPayload(seed: ConversationSeed): PersistedTripPayload {
  return {
    tripId: seed.currentTripId,
    title: "東京四日遊",
    destination: "東京",
    days: 4,
    itinerary: [
      {
        dayNumber: 1,
        theme: "上野",
        items: [
          { id: seed.itemIds.day1UenoPark, dayNumber: 1, time: "09:00", title: "上野公園", type: "attraction" },
          { id: seed.itemIds.day1Ameyoko, dayNumber: 1, time: "14:00", title: "阿美橫町", type: "shopping" },
        ],
      },
      {
        dayNumber: 2,
        theme: "原宿與澀谷",
        items: [
          { id: seed.itemIds.day2Meiji, dayNumber: 2, time: "10:00", title: "明治神宮", type: "attraction" },
          { id: seed.itemIds.day2Shibuya, dayNumber: 2, time: "15:00", title: "澀谷十字路口", type: "attraction" },
        ],
      },
      {
        dayNumber: 3,
        theme: "東京車站",
        items: [
          { id: seed.itemIds.day3TokyoStation, dayNumber: 3, time: "10:00", title: "東京車站", type: "transport" },
        ],
      },
      { dayNumber: 4, theme: "空白", items: [] },
    ],
    pins: [],
    updatedAt: new Date("2026-06-15T00:00:00.000Z").toISOString(),
  };
}
