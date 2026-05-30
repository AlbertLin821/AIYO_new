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
export type Phase7TokyoSeed = {
  tripId: string;
  itemIds: {
    day1Asakusa: string;
    day1Ueno: string;
    day2Akihabara: string;
    day2Ginza: string;
    day3Shinjuku: string;
    day3Shibuya: string;
  };
};

/** Phase 7 東京三天行程：含偏好、活動 ID 與秋葉原 pin（供 marker 清除驗證）。 */
export async function seedTokyoPhase7ScenarioForUser(userId: string): Promise<Phase7TokyoSeed> {
  await prisma.profile.update({
    where: { userId },
    data: {
      destination: "東京",
      budget: 15000,
      preferences: {
        interests: ["food", "shopping"],
        preferredTransport: "transit",
        pace: "moderate",
        notes: "中等預算、美食與購物、步調適中",
      } as object,
    },
  });

  const trip = await prisma.trip.create({
    data: {
      userId,
      title: "東京三天美食購物行程",
      destination: "東京",
      days: 3,
      itineraryDays: {
        create: [
          { dayNumber: 1, sortOrder: 0, theme: "淺草與上野", summary: "傳統與公園" },
          { dayNumber: 2, sortOrder: 1, theme: "秋葉原與銀座", summary: "動漫與購物" },
          { dayNumber: 3, sortOrder: 2, theme: "新宿與澀谷", summary: "都會散步" },
        ],
      },
      items: {
        create: [
          { day: 1, order: 0, title: "淺草", timeSlot: "09:00", itemType: "attraction", source: "manual", location: "淺草" },
          { day: 1, order: 1, title: "上野", timeSlot: "14:00", itemType: "attraction", source: "manual", location: "上野" },
          {
            day: 2,
            order: 0,
            title: "秋葉原",
            timeSlot: "10:00",
            itemType: "attraction",
            source: "manual",
            location: "秋葉原",
            latitude: 35.6984,
            longitude: 139.7731,
          },
          { day: 2, order: 1, title: "銀座", timeSlot: "15:00", itemType: "attraction", source: "manual", location: "銀座" },
          { day: 3, order: 0, title: "新宿", timeSlot: "10:00", itemType: "attraction", source: "manual", location: "新宿" },
          { day: 3, order: 1, title: "澀谷", timeSlot: "16:00", itemType: "attraction", source: "manual", location: "澀谷" },
        ],
      },
      room: {
        create: {
          inviteCode: `P7-${Date.now().toString(36).toUpperCase()}`,
        },
      },
    },
    include: {
      items: {
        orderBy: [{ day: "asc" }, { order: "asc" }],
      },
    },
  });

  const byTitle = (title: string) => {
    const item = trip.items.find((candidate) => candidate.title === title);
    if (!item) {
      throw new Error(`seedTokyoPhase7ScenarioForUser: missing item ${title}`);
    }
    return item.id;
  };

  const day2Akihabara = trip.items.find((item) => item.title === "秋葉原");
  if (day2Akihabara) {
    await prisma.mapPin.create({
      data: {
        tripId: trip.id,
        label: "秋葉原",
        lat: 35.6984,
        lng: 139.7731,
        description: "秋葉原",
        linkedTripItemId: day2Akihabara.id,
        dayNumber: 2,
        source: "manual",
        color: "#5a7ea3",
        verified: true,
      },
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

  return {
    tripId: trip.id,
    itemIds: {
      day1Asakusa: byTitle("淺草"),
      day1Ueno: byTitle("上野"),
      day2Akihabara: byTitle("秋葉原"),
      day2Ginza: byTitle("銀座"),
      day3Shinjuku: byTitle("新宿"),
      day3Shibuya: byTitle("澀谷"),
    },
  };
}

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

/** Phase 7.5 首爾兩天行程：供 live AssistantAction 修改驗證（弘大 → 聖水洞）。 */
export type Phase75SeoulSeed = {
  tripId: string;
  itemIds: {
    day1Hongdae: string;
    day1Myeongdong: string;
    day2Gyeongbok: string;
    day2Bukchon: string;
  };
};

export async function seedSeoulPhase75ScenarioForUser(userId: string): Promise<Phase75SeoulSeed> {
  await prisma.profile.update({
    where: { userId },
    data: {
      destination: "首爾",
      budget: 18000,
      preferences: {
        interests: ["food", "shopping", "culture"],
        preferredTransport: "transit",
        pace: "moderate",
        notes: "咖啡廳、購物、韓劇景點",
      } as object,
    },
  });

  const trip = await prisma.trip.create({
    data: {
      userId,
      title: "首爾五天咖啡廳與韓劇景點",
      destination: "首爾",
      days: 2,
      itineraryDays: {
        create: [
          { dayNumber: 1, sortOrder: 0, theme: "弘大與明洞", summary: "年輕文化與購物" },
          { dayNumber: 2, sortOrder: 1, theme: "景福宮與北村", summary: "傳統韓屋" },
        ],
      },
      items: {
        create: [
          { day: 1, order: 0, title: "弘大", timeSlot: "10:00", itemType: "attraction", source: "manual", location: "弘大" },
          { day: 1, order: 1, title: "明洞", timeSlot: "15:00", itemType: "attraction", source: "manual", location: "明洞" },
          { day: 2, order: 0, title: "景福宮", timeSlot: "09:30", itemType: "attraction", source: "manual", location: "景福宮" },
          { day: 2, order: 1, title: "北村韓屋村", timeSlot: "14:00", itemType: "attraction", source: "manual", location: "北村韓屋村" },
        ],
      },
      room: {
        create: {
          inviteCode: `P75-${Date.now().toString(36).toUpperCase()}`,
        },
      },
    },
    include: {
      items: {
        orderBy: [{ day: "asc" }, { order: "asc" }],
      },
    },
  });

  const byTitle = (title: string) => {
    const item = trip.items.find((candidate) => candidate.title === title);
    if (!item) {
      throw new Error(`seedSeoulPhase75ScenarioForUser: missing item ${title}`);
    }
    return item.id;
  };

  const prev = await prisma.profile.findUnique({ where: { userId }, select: { preferences: true } });
  const raw = prev?.preferences;
  const prefs: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  prefs.activeTripId = trip.id;

  await prisma.profile.update({
    where: { userId },
    data: { preferences: prefs as object },
  });

  return {
    tripId: trip.id,
    itemIds: {
      day1Hongdae: byTitle("弘大"),
      day1Myeongdong: byTitle("明洞"),
      day2Gyeongbok: byTitle("景福宮"),
      day2Bukchon: byTitle("北村韓屋村"),
    },
  };
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

export async function seedPublishedTripForUser(userId: string, title = "E2E 公開台南") {
  const trip = await seedTripForUser(userId, title);
  const fullTrip = await prisma.trip.findUnique({
    where: { id: trip.id },
    include: { items: true, pins: true },
  });
  if (!fullTrip) {
    throw new Error("seedPublishedTripForUser: trip missing after create");
  }
  const item = fullTrip.items[0];
  const pin = fullTrip.pins[0];
  const snapshot = {
    title: fullTrip.title,
    destination: fullTrip.destination ?? "",
    days: fullTrip.days,
    coverImageUrl: fullTrip.coverImageUrl,
    itinerary: [
      {
        dayNumber: 1,
        items: item
          ? [
              {
                id: item.id,
                dayNumber: 1,
                time: item.timeSlot ?? "09:00",
                title: item.title,
                type: item.itemType ?? "attraction",
                location: item.location
                  ? {
                      name: item.location,
                      lat: item.latitude ?? undefined,
                      lng: item.longitude ?? undefined,
                      address: item.locationAddress ?? undefined,
                    }
                  : undefined,
              },
            ]
          : [],
      },
    ],
    pins: pin
      ? [
          {
            id: pin.id,
            name: pin.label,
            lat: pin.lat,
            lng: pin.lng,
            address: pin.address ?? undefined,
            phoneNumber: pin.phoneNumber ?? undefined,
            website: pin.website ?? undefined,
            description: pin.label,
          },
        ]
      : [],
  };
  const publication = await prisma.tripPublication.create({
    data: {
      tripId: trip.id,
      publisherId: userId,
      title: snapshot.title,
      coverImageUrl: snapshot.coverImageUrl,
      days: snapshot.days,
      destination: snapshot.destination || null,
      searchText: `${snapshot.title} ${snapshot.destination} ${item?.title ?? ""}`.toLowerCase(),
      snapshotJson: snapshot,
      publisherImage: null,
    },
  });
  return { trip, publicationId: publication.id };
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

