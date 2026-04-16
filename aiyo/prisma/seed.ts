import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "seed@aiyo.local" },
    update: { name: "種子使用者" },
    create: {
      email: "seed@aiyo.local",
      name: "種子使用者",
      profile: {
        create: {
          budget: 50000,
          destination: "Tokyo",
          preferences: {
            interests: ["food", "shopping", "night view"],
            preferredTransport: "Train",
            pace: "moderate",
          },
        },
      },
    },
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: {
      budget: 50000,
      destination: "Tokyo",
      preferences: {
        interests: ["food", "shopping", "night view"],
        preferredTransport: "Train",
        pace: "moderate",
      },
    },
    create: {
      userId: user.id,
      budget: 50000,
      destination: "Tokyo",
      preferences: {
        interests: ["food", "shopping", "night view"],
        preferredTransport: "Train",
        pace: "moderate",
      },
    },
  });

  const trip = await prisma.trip.upsert({
    where: { id: `seed_trip_${user.id}` },
    update: {
      title: "Tokyo Seed Trip",
      destination: "Tokyo",
      days: 5,
    },
    create: {
      id: `seed_trip_${user.id}`,
      userId: user.id,
      title: "Tokyo Seed Trip",
      destination: "Tokyo",
      days: 5,
    },
  });

  await prisma.tripItem.deleteMany({ where: { tripId: trip.id } });
  await prisma.mapPin.deleteMany({ where: { tripId: trip.id } });
  await prisma.chatMessage.deleteMany({ where: { tripId: trip.id } });

  await prisma.tripItem.createMany({
    data: [
      {
        tripId: trip.id,
        day: 1,
        title: "Senso-ji morning walk",
        description: "Historic temple district and market street.",
        timeSlot: "09:00",
        location: "Senso-ji",
        latitude: 35.7148,
        longitude: 139.7967,
        order: 1,
      },
      {
        tripId: trip.id,
        day: 1,
        title: "Tsukiji lunch stop",
        description: "Seafood market lunch and small bites.",
        timeSlot: "12:00",
        location: "Tsukiji Outer Market",
        latitude: 35.6655,
        longitude: 139.7708,
        order: 2,
      },
      {
        tripId: trip.id,
        day: 2,
        title: "Shibuya shopping block",
        description: "Shopping and cafe cluster.",
        timeSlot: "14:00",
        location: "Shibuya",
        latitude: 35.6595,
        longitude: 139.7005,
        order: 1,
      },
    ],
  });

  await prisma.mapPin.createMany({
    data: [
      {
        tripId: trip.id,
        label: "Senso-ji",
        lat: 35.7148,
        lng: 139.7967,
        description: "Historic temple district and market street.",
        address: "2 Chome-3-1 Asakusa, Taito City, Tokyo",
        dayNumber: 1,
      },
      {
        tripId: trip.id,
        label: "Tsukiji Outer Market",
        lat: 35.6655,
        lng: 139.7708,
        description: "Seafood market lunch and small bites.",
        address: "4 Chome-16-2 Tsukiji, Chuo City, Tokyo",
        dayNumber: 1,
      },
    ],
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        userId: user.id,
        tripId: trip.id,
        role: "assistant",
        content: "Welcome back. Your Tokyo seed trip is ready to edit.",
      },
      {
        userId: user.id,
        tripId: trip.id,
        role: "user",
        content: "Make day 2 more food-focused.",
      },
    ],
  });

  const room = await prisma.collaborationRoom.upsert({
    where: { tripId: trip.id },
    update: { inviteCode: "AIYO-DEMO-TOKYO" },
    create: {
      tripId: trip.id,
      inviteCode: "AIYO-DEMO-TOKYO",
    },
  });

  await prisma.comment.deleteMany({ where: { roomId: room.id } });
  await prisma.collaborationPresence.deleteMany({ where: { roomId: room.id } });

  await prisma.comment.create({
    data: {
      roomId: room.id,
      authorId: user.id,
      content: "Move Tsukiji earlier if the group wants a stronger food-first route.",
    },
  });

  await prisma.collaborationPresence.create({
    data: {
      roomId: room.id,
      userId: user.id,
      activeSection: "itinerary",
      selectedEntityId: trip.id,
      online: true,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
