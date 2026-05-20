import bcrypt from "bcryptjs";
import { prisma } from "../../../src/lib/prisma";
import type { PersistedTripPayload } from "../../../src/types";

export const TEST_PASSWORD = "TestPassword123!";

export const E2E_OWNER = {
  email: "test-user@example.com",
  name: "Test User",
  password: TEST_PASSWORD,
};

export const E2E_COLLABORATOR = {
  email: "collaborator@example.com",
  name: "Collaborator User",
  password: TEST_PASSWORD,
};

export type E2EUser = typeof E2E_OWNER;

export async function resetE2EData() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: [E2E_OWNER.email, E2E_COLLABORATOR.email],
      },
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const trips = await prisma.trip.findMany({
    where: {
      OR: [{ userId: { in: userIds } }, { collaborators: { some: { userId: { in: userIds } } } }],
    },
    select: { id: true },
  });
  const tripIds = trips.map((trip) => trip.id);
  const rooms = tripIds.length
    ? await prisma.collaborationRoom.findMany({
        where: { tripId: { in: tripIds } },
        select: { id: true },
      })
    : [];
  const roomIds = rooms.map((room) => room.id);

  await prisma.$transaction([
    roomIds.length
      ? prisma.collaborationPresence.deleteMany({ where: { roomId: { in: roomIds } } })
      : prisma.collaborationPresence.deleteMany({ where: { userId: { in: userIds } } }),
    roomIds.length
      ? prisma.comment.deleteMany({ where: { OR: [{ roomId: { in: roomIds } }, { authorId: { in: userIds } }] } })
      : prisma.comment.deleteMany({ where: { authorId: { in: userIds } } }),
    prisma.chatMessage.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tripId: { in: tripIds } }] } }),
    prisma.tripCollaborator.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { tripId: { in: tripIds } }] } }),
    prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.account.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.profile.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.itineraryFolder.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
  await prisma.$disconnect();
}

export async function seedAuthUsers() {
  await resetE2EData();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const [owner, collaborator] = await prisma.$transaction([
    prisma.user.upsert({
      where: { email: E2E_OWNER.email },
      update: {
        name: E2E_OWNER.name,
        passwordHash,
        profile: {
          upsert: {
            update: {
              budget: 12000,
              destination: "台南",
              preferences: {
                interests: ["food", "culture"],
                preferredTransport: "walk",
                pace: "moderate",
              },
            },
            create: {
              budget: 12000,
              destination: "台南",
              preferences: {
                interests: ["food", "culture"],
                preferredTransport: "walk",
                pace: "moderate",
              },
            },
          },
        },
      },
      create: {
        email: E2E_OWNER.email,
        name: E2E_OWNER.name,
        passwordHash,
        profile: {
          create: {
            budget: 12000,
            destination: "台南",
            preferences: {
              interests: ["food", "culture"],
              preferredTransport: "walk",
              pace: "moderate",
            },
          },
        },
      },
    }),
    prisma.user.upsert({
      where: { email: E2E_COLLABORATOR.email },
      update: {
        name: E2E_COLLABORATOR.name,
        passwordHash,
        profile: {
          upsert: {
            update: {
              budget: 8000,
              destination: "台南",
              preferences: {
                interests: ["food"],
                preferredTransport: "walk",
                pace: "moderate",
              },
            },
            create: {
              budget: 8000,
              destination: "台南",
              preferences: {
                interests: ["food"],
                preferredTransport: "walk",
                pace: "moderate",
              },
            },
          },
        },
      },
      create: {
        email: E2E_COLLABORATOR.email,
        name: E2E_COLLABORATOR.name,
        passwordHash,
        profile: {
          create: {
            budget: 8000,
            destination: "台南",
            preferences: {
              interests: ["food"],
              preferredTransport: "walk",
              pace: "moderate",
            },
          },
        },
      },
    }),
  ]);

  return { owner, collaborator };
}

/** 嘉義兩天一夜手動模擬情境：供完整旅遊 QA 與影片摘要流程使用（不建立預設景點項目，由測試後續填入）。 */
export async function seedChiayiScenarioForUser(userId: string) {
  await prisma.profile.update({
    where: { userId },
    data: {
      destination: "嘉義市",
      budget: 8000,
      preferences: {
        interests: ["food", "culture", "night-market", "photo"],
        preferredTransport: "train",
        pace: "moderate",
        notes: "美食、夜市、文化景點、火雞肉飯、砂鍋魚頭、老屋街區、拍照",
      } as object,
    },
  });

  const trip = await prisma.trip.create({
    data: {
      userId,
      title: "嘉義兩天一夜美食與市區景點旅行",
      destination: "嘉義市",
      days: 2,
      itineraryDays: {
        create: [
          {
            dayNumber: 1,
            sortOrder: 0,
            theme: "美食與夜市",
            summary: "文化路夜市與小吃",
          },
          {
            dayNumber: 2,
            sortOrder: 1,
            theme: "市區文化散步",
            summary: "老屋與車站周邊",
          },
        ],
      },
      room: {
        create: {
          inviteCode: `AIYO-${Date.now().toString(36).toUpperCase()}`,
        },
      },
    },
  });

  const prev = await prisma.profile.findUnique({ where: { userId }, select: { preferences: true } });
  const raw = prev?.preferences;
  const prefs: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  prefs.activeTripId = trip.id;

  await prisma.profile.update({
    where: { userId },
    data: { preferences: prefs as object },
  });

  return trip;
}

export async function seedTripForUser(userId: string, title = "E2E 台南行程") {
  return prisma.trip.create({
    data: {
      userId,
      title,
      destination: "台南",
      days: 1,
      itineraryDays: {
        create: {
          dayNumber: 1,
          sortOrder: 0,
          theme: "老城散步",
          summary: "E2E seeded itinerary",
        },
      },
      items: {
        create: {
          day: 1,
          title: "赤崁樓",
          description: "E2E seeded stop",
          timeSlot: "09:00",
          location: "赤崁樓",
          latitude: 22.9972,
          longitude: 120.2023,
          order: 0,
        },
      },
      pins: {
        create: {
          label: "赤崁樓",
          lat: 22.9972,
          lng: 120.2023,
          description: "E2E seeded pin",
          address: "台南市中西區民族路二段212號",
          dayNumber: 1,
        },
      },
      room: {
        create: {
          inviteCode: `AIYO-${Date.now().toString(36).toUpperCase()}`,
        },
      },
    },
  });
}

/** 單日兩個有經緯度的 TripItem，供地圖行程面板路段與 Directions 相關測試。 */
export async function seedTwoLocatedStopsTripForUser(userId: string) {
  const trip = await prisma.trip.create({
    data: {
      userId,
      title: "E2E 雙座標路段",
      destination: "台南市",
      days: 1,
      itineraryDays: {
        create: {
          dayNumber: 1,
          sortOrder: 0,
          theme: "路段測試",
          summary: "兩個有座標的停靠點",
        },
      },
      items: {
        create: [
          {
            day: 1,
            title: "孔廟",
            description: "起點",
            timeSlot: "09:00",
            itemType: "attraction",
            source: "manual",
            location: "台南孔廟",
            latitude: 22.9901,
            longitude: 120.2041,
            order: 0,
          },
          {
            day: 1,
            title: "赤崁樓",
            description: "終點",
            timeSlot: "10:30",
            itemType: "attraction",
            source: "manual",
            location: "赤崁樓",
            latitude: 22.9972,
            longitude: 120.2023,
            order: 1,
          },
        ],
      },
      room: {
        create: {
          inviteCode: `RT2-${Date.now().toString(36)}`,
        },
      },
    },
    include: {
      items: {
        orderBy: [{ day: "asc" }, { order: "asc" }],
      },
    },
  });

  const [confuciusTemple, chihkanTower] = trip.items;
  if (confuciusTemple && chihkanTower) {
    await prisma.mapPin.createMany({
      data: [
        {
          tripId: trip.id,
          label: "孔廟",
          lat: 22.9901,
          lng: 120.2041,
          description: "台南孔廟",
          address: "台南市中西區南門路2號",
          linkedTripItemId: confuciusTemple.id,
          dayNumber: 1,
          source: "manual",
          color: "#5a7ea3",
          verified: true,
        },
        {
          tripId: trip.id,
          label: "赤崁樓",
          lat: 22.9972,
          lng: 120.2023,
          description: "赤崁樓",
          address: "台南市中西區民族路二段212號",
          linkedTripItemId: chihkanTower.id,
          dayNumber: 1,
          source: "manual",
          color: "#5a7ea3",
          verified: true,
        },
      ],
    });
  }

  const prev = await prisma.profile.findUnique({ where: { userId }, select: { preferences: true } });
  const raw = prev?.preferences;
  const prefs: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  prefs.activeTripId = trip.id;

  await prisma.profile.update({
    where: { userId },
    data: { preferences: prefs as object },
  });

  return trip;
}

export async function findFolderByName(userId: string, name: string) {
  return prisma.itineraryFolder.findFirst({
    where: { userId, name },
  });
}

export async function getTripFolderId(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { folderId: true },
  });
  return trip?.folderId ?? null;
}

export async function getTripById(tripId: string) {
  return prisma.trip.findUnique({
    where: { id: tripId },
  });
}

export function buildTripPayload(tripId: string, title: string): PersistedTripPayload {
  return {
    tripId,
    title,
    destination: "台南",
    days: 1,
    itinerary: [
      {
        dayNumber: 1,
        theme: "老城散步",
        summary: "Edited by E2E",
        items: [
          {
            id: "e2e-item-1",
            dayNumber: 1,
            time: "10:00",
            title: "孔廟",
            type: "activity",
            notes: "Editor permission check",
            location: {
              name: "台南孔廟",
              lat: 22.9901,
              lng: 120.2041,
              description: "台南孔廟",
              address: "台南市中西區南門路2號",
            },
            source: "manual",
          },
        ],
      },
    ],
    pins: [
      {
        id: "e2e-pin-1",
        name: "台南孔廟",
        lat: 22.9901,
        lng: 120.2041,
        description: "Editor permission check",
        address: "台南市中西區南門路2號",
        dayNumber: 1,
        source: "manual",
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

