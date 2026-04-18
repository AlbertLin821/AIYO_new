import { prisma } from "@/lib/prisma";
import type {
  BootstrapPayload,
  ChatMessage,
  CollaborationPresenceState,
  CollaborativeComment,
  EditingPresence,
  MapPin,
  PersistedTripPayload,
  User,
} from "@/types";

function buildInviteCode(seed: string): string {
  return `AIYO-${seed.slice(0, 8).toUpperCase()}`;
}

function toUserProfile(input: {
  name?: string | null;
  email: string;
  preferences?: unknown;
  budget?: number | null;
  destination?: string | null;
}): User {
  const preferences = (input.preferences || {}) as {
    interests?: string[];
    preferredTransport?: string;
    pace?: User["travelPace"];
  };

  return {
    name: input.name || input.email.split("@")[0],
    email: input.email,
    travelPreferences: preferences.interests || [],
    budget: input.budget ?? 0,
    destination: input.destination?.trim() || "",
    travelDays: 1,
    preferredTransport: preferences.preferredTransport?.trim() || "",
    travelPace: preferences.pace || "moderate",
    interests: preferences.interests || [],
  };
}

function serializeChatMessages(
  messages: Array<{ id: string; role: string; content: string; createdAt: Date }>,
): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as ChatMessage["role"],
    content: message.content,
    timestamp: message.createdAt.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));
}

function sanitizeBootstrapTrip(input: {
  trip: PersistedTripPayload;
  profile: User;
  chatMessages: ChatMessage[];
}): PersistedTripPayload {
  const hasItinerary = input.trip.itinerary.some((day) => day.items.length > 0);
  const hasPins = input.trip.pins.length > 0;
  const hasStructuredTrip = hasItinerary || hasPins || input.trip.days > 1;
  const hasProfileContext =
    Boolean(input.profile.destination.trim()) ||
    input.profile.travelDays > 1 ||
    input.profile.budget > 0;

  if (hasStructuredTrip || hasProfileContext || input.chatMessages.length > 0) {
    return input.trip;
  }

  return {
    ...input.trip,
    title: "",
    destination: "",
    days: 1,
  };
}

function serializeTrip(trip: {
  id: string;
  title: string;
  destination: string | null;
  days: number;
  updatedAt: Date;
  itineraryDays: Array<{
    id: string;
    dayNumber: number;
    theme: string | null;
    summary: string | null;
    sortOrder: number;
  }>;
  items: Array<{
    id: string;
    day: number;
    title: string;
    description: string | null;
    timeSlot: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    order: number;
  }>;
  pins: Array<{
    id: string;
    label: string;
    lat: number;
    lng: number;
    description: string | null;
    address: string | null;
    linkedTripItemId: string | null;
    dayNumber: number | null;
  }>;
}): PersistedTripPayload {
  const grouped = new Map<number, PersistedTripPayload["itinerary"][number]>();
  const orderedDays = [...trip.itineraryDays].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.dayNumber - right.dayNumber,
  );

  for (const day of orderedDays) {
    grouped.set(day.dayNumber, {
      dayNumber: day.dayNumber,
      theme: day.theme || `Day ${day.dayNumber}`,
      summary: day.summary || undefined,
      items: [],
    });
  }

  for (const item of trip.items.sort((left, right) => left.day - right.day || left.order - right.order)) {
    if (!grouped.has(item.day)) {
      grouped.set(item.day, {
        dayNumber: item.day,
        theme: `Day ${item.day}`,
        summary: undefined,
        items: [],
      });
    }
    grouped.get(item.day)?.items.push({
      id: item.id,
      dayNumber: item.day,
      time: item.timeSlot || "09:00",
      title: item.title,
      type: "activity",
      notes: item.description || undefined,
      location:
        item.location && item.latitude != null && item.longitude != null
          ? {
              name: item.location,
              lat: item.latitude,
              lng: item.longitude,
              description: item.description || `${item.location} stop`,
              address: item.location,
            }
          : undefined,
      source: "manual",
    });
  }

  const itinerary = Array.from(grouped.values()).sort((left, right) => left.dayNumber - right.dayNumber);
  const pins: MapPin[] = trip.pins.map((pin) => ({
    id: pin.id,
    name: pin.label,
    lat: pin.lat,
    lng: pin.lng,
    description: pin.description || pin.label,
    address: pin.address || undefined,
    linkedTripItemId: pin.linkedTripItemId || undefined,
    dayNumber: pin.dayNumber || undefined,
    source: "itinerary",
  }));

  return {
    tripId: trip.id,
    title: trip.title,
    destination: trip.destination?.trim() || "",
    days: trip.days,
    itinerary,
    pins,
    updatedAt: trip.updatedAt.toISOString(),
  };
}

export async function ensureProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  if (!user) {
    throw new Error("missing_user");
  }

  if (!user.profile) {
    await prisma.profile.create({
      data: {
        userId,
        budget: null,
        destination: null,
        preferences: {
          interests: [],
          preferredTransport: "",
          pace: "moderate",
        },
      },
    });
  }

  return prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
}

export async function ensureCurrentTrip(userId: string) {
  const existing = await prisma.trip.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { itineraryDays: true, items: true, pins: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.trip.create({
    data: {
      userId,
      title: "",
      destination: null,
      days: 1,
      itineraryDays: {
        create: {
          dayNumber: 1,
          sortOrder: 0,
          theme: "Day 1",
          summary: null,
        },
      },
    },
    include: { itineraryDays: true, items: true, pins: true },
  });
}

export async function ensureCollaborationRoom(tripId: string) {
  const room = await prisma.collaborationRoom.upsert({
    where: { tripId },
    update: {},
    create: {
      tripId,
      inviteCode: buildInviteCode(tripId),
    },
    include: {
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      presences: { include: { user: true } },
      trip: { include: { user: true } },
    },
  });
  return room;
}

export async function getBootstrapPayload(userId: string): Promise<BootstrapPayload> {
  const user = await ensureProfile(userId);
  const trip = await ensureCurrentTrip(userId);
  const room = await ensureCollaborationRoom(trip.id);
  const messages = await prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const profile = toUserProfile({
    name: user.name,
    email: user.email,
    preferences: user.profile?.preferences,
    budget: user.profile?.budget,
    destination: user.profile?.destination,
  });
  const chatMessages = serializeChatMessages(messages);
  const tripPayload = sanitizeBootstrapTrip({
    trip: serializeTrip({
      ...trip,
      itineraryDays: trip.itineraryDays,
      items: trip.items,
      pins: trip.pins,
    }),
    profile,
    chatMessages,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    profile,
    trip: tripPayload,
    chatMessages,
    collaboration: serializeCollaboration(room),
  };
}

export async function updateProfile(userId: string, input: Partial<User>) {
  const preferences = {
    interests: input.interests || input.travelPreferences || [],
    preferredTransport: input.preferredTransport?.trim() || "",
    pace: input.travelPace || "moderate",
  };

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      email: input.email,
      profile: {
        upsert: {
          update: {
            budget: input.budget,
            destination: input.destination,
            preferences,
          },
          create: {
            budget: input.budget,
            destination: input.destination,
            preferences,
          },
        },
      },
    },
    include: { profile: true },
  });

  return toUserProfile({
    name: user.name,
    email: user.email,
    preferences: user.profile?.preferences,
    budget: user.profile?.budget,
    destination: user.profile?.destination,
  });
}

export async function saveTripPayload(userId: string, input: PersistedTripPayload) {
  const trip = input.tripId
    ? await prisma.trip.upsert({
        where: { id: input.tripId },
        update: {
          title: input.title,
          destination: input.destination,
          days: Math.max(1, input.itinerary.length || input.days),
        },
        create: {
          userId,
          title: input.title,
          destination: input.destination,
          days: Math.max(1, input.itinerary.length || input.days),
        },
      })
    : await prisma.trip.create({
        data: {
          userId,
          title: input.title,
          destination: input.destination,
          days: Math.max(1, input.itinerary.length || input.days),
        },
      });

  await prisma.tripDay.deleteMany({ where: { tripId: trip.id } });
  await prisma.tripItem.deleteMany({ where: { tripId: trip.id } });
  await prisma.mapPin.deleteMany({ where: { tripId: trip.id } });

  const normalizedDays =
    input.itinerary.length > 0
      ? input.itinerary
      : [
          {
            dayNumber: 1,
            theme: "Day 1",
            summary: undefined,
            items: [],
          },
        ];

  await prisma.tripDay.createMany({
    data: normalizedDays.map((day, index) => ({
      tripId: trip.id,
      dayNumber: day.dayNumber,
      theme: day.theme || null,
      summary: day.summary || null,
      sortOrder: index,
    })),
  });

  const items = normalizedDays.flatMap((day) =>
    day.items.map((item, index) => ({
      tripId: trip.id,
      day: day.dayNumber,
      title: item.title,
      description: item.notes || null,
      timeSlot: item.time,
      location: item.location?.name || null,
      latitude: item.location?.lat || null,
      longitude: item.location?.lng || null,
      order: index,
    })),
  );

  if (items.length > 0) {
    await prisma.tripItem.createMany({ data: items });
  }

  if (input.pins.length > 0) {
    await prisma.mapPin.createMany({
      data: input.pins.map((pin) => ({
        tripId: trip.id,
        label: pin.name,
        lat: pin.lat,
        lng: pin.lng,
        description: pin.description,
        address: pin.address || null,
        linkedTripItemId: pin.linkedTripItemId || null,
        dayNumber: pin.dayNumber || null,
      })),
    });
  }

  const freshTrip = await prisma.trip.findUniqueOrThrow({
    where: { id: trip.id },
    include: { itineraryDays: true, items: true, pins: true },
  });

  await ensureCollaborationRoom(trip.id);
  return serializeTrip(freshTrip);
}

export async function saveChatMessage(userId: string, role: string, content: string, tripId?: string) {
  return prisma.chatMessage.create({
    data: {
      userId,
      role,
      content,
      tripId,
    },
  });
}

function serializeComments(
  comments: Array<{ id: string; content: string; createdAt: Date; author: { name: string | null; image: string | null } }>,
): CollaborativeComment[] {
  return comments.map((comment, index) => ({
    id: comment.id,
    author: comment.author.name || "AIYO user",
    authorAvatar: comment.author.image || undefined,
    content: comment.content,
    color: ["#FFDAB9", "#B8D8BA", "#C3B1E1", "#F4A7B9"][index % 4],
    position: { x: 0, y: 0 },
    createdAt: comment.createdAt.toISOString(),
  }));
}

function serializePresence(
  presences: Array<{ userId: string; activeSection: string | null; selectedEntityId: string | null; online: boolean; user: { name: string | null } }>,
): EditingPresence[] {
  return presences
    .filter((entry) => entry.online)
    .map((entry, index) => ({
      userId: entry.userId,
      userName: entry.user.name || "AIYO user",
      cursorPosition: { x: 30 + index * 25, y: 40 + index * 18 },
      color: ["#7C9CBF", "#F4A7B9", "#B8D8BA", "#C3B1E1"][index % 4],
      activeSection: entry.activeSection || "workspace",
    }));
}

function serializeCollaboration(room: {
  id: string;
  inviteCode: string;
  tripId: string;
  comments: Array<{ id: string; content: string; createdAt: Date; author: { name: string | null; image: string | null } }>;
  presences: Array<{ userId: string; activeSection: string | null; selectedEntityId: string | null; online: boolean; user: { id: string; name: string | null; image: string | null } }>;
  trip: { user: { id: string; name: string | null; image: string | null } };
}): CollaborationPresenceState {
  const memberMap = new Map<string, { id: string; name: string; avatar: string; role: "owner" | "editor" | "viewer"; online: boolean }>();

  memberMap.set(room.trip.user.id, {
    id: room.trip.user.id,
    name: room.trip.user.name || "Owner",
    avatar: room.trip.user.image || "",
    role: "owner",
    online: room.presences.some((presence) => presence.userId === room.trip.user.id && presence.online),
  });

  room.presences.forEach((presence) => {
    if (!memberMap.has(presence.userId)) {
      memberMap.set(presence.userId, {
        id: presence.userId,
        name: presence.user.name || "Collaborator",
        avatar: presence.user.image || "",
        role: "editor",
        online: presence.online,
      });
    }
  });

  return {
    roomId: room.id,
    inviteCode: room.inviteCode,
    shareLink: `/collaborate?invite=${room.inviteCode}`,
    comments: serializeComments(room.comments),
    presence: serializePresence(room.presences),
    members: Array.from(memberMap.values()),
  };
}

export async function getCollaborationState(tripId: string) {
  const room = await ensureCollaborationRoom(tripId);
  return serializeCollaboration(room);
}

export async function addComment(roomId: string, authorId: string, content: string) {
  await prisma.comment.create({
    data: {
      roomId,
      authorId,
      content,
    },
  });

  const room = await prisma.collaborationRoom.findUniqueOrThrow({
    where: { id: roomId },
    include: {
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      presences: { include: { user: true } },
      trip: { include: { user: true } },
    },
  });

  return serializeCollaboration(room);
}

export async function upsertPresence(input: {
  roomId: string;
  userId: string;
  activeSection?: string;
  selectedEntityId?: string;
}) {
  await prisma.collaborationPresence.upsert({
    where: {
      roomId_userId: {
        roomId: input.roomId,
        userId: input.userId,
      },
    },
    update: {
      activeSection: input.activeSection,
      selectedEntityId: input.selectedEntityId,
      online: true,
      lastSeenAt: new Date(),
    },
    create: {
      roomId: input.roomId,
      userId: input.userId,
      activeSection: input.activeSection,
      selectedEntityId: input.selectedEntityId,
      online: true,
      lastSeenAt: new Date(),
    },
  });
}

export async function cleanupStalePresence(roomId: string) {
  const staleBefore = new Date(Date.now() - 30_000);
  await prisma.collaborationPresence.updateMany({
    where: {
      roomId,
      lastSeenAt: { lt: staleBefore },
      online: true,
    },
    data: { online: false },
  });
}
