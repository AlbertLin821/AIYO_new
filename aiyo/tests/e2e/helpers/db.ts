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
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [E2E_OWNER.email, E2E_COLLABORATOR.email],
      },
    },
  });
}

export async function seedAuthUsers() {
  await resetE2EData();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const [owner, collaborator] = await prisma.$transaction([
    prisma.user.create({
      data: {
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
    prisma.user.create({
      data: {
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

