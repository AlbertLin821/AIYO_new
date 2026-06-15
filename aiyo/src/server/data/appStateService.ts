import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { applyChatMessageMetadata, extractChatMessageMetadata } from "@/lib/chatMessageMetadata";
import { prisma } from "@/lib/prisma";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { findLinkedPinForItem } from "@/lib/mapPinItineraryLink";
import { reconcileTripMapState } from "@/services/mapSync";
import { repairTripHydration } from "@/server/services/repairTripHydration";
import { getTripAccess, requireTripAccess } from "@/server/tripAccess";
import type { TripPlanItem } from "@/types";
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

function buildInviteCode(tripId: string): string {
  // `inviteCode` is unique in the DB; truncating CUID prefixes can collide when
  // multiple trips are created in the same tick, causing Prisma P2002 and a 500 from /api/bootstrap.
  return `AIYO-${tripId.replace(/-/g, "").toUpperCase()}`;
}

export function toUserProfile(input: {
  name?: string | null;
  email: string;
  preferences?: unknown;
  budget?: number | null;
  destination?: string | null;
}): User {
  const preferences = (input.preferences || {}) as {
    interests?: string[];
    interestIcons?: Record<string, string>;
    preferredTransport?: string;
    pace?: User["travelPace"] | null;
    travelDays?: number;
  };

  const rawPace = preferences.pace;
  const travelPace: User["travelPace"] =
    rawPace === "relaxed" || rawPace === "moderate" || rawPace === "intensive" ? rawPace : "";

  const travelDays =
    typeof preferences.travelDays === "number" && Number.isFinite(preferences.travelDays)
      ? Math.max(0, Math.min(30, Math.floor(preferences.travelDays)))
      : 0;

  return {
    name: input.name || input.email.split("@")[0],
    email: input.email,
    travelPreferences: preferences.interests || [],
    budget: input.budget ?? 0,
    destination: input.destination?.trim() || "",
    travelDays,
    preferredTransport: preferences.preferredTransport?.trim() || "",
    travelPace,
    interests: preferences.interests || [],
    interestIcons:
      preferences.interestIcons && typeof preferences.interestIcons === "object"
        ? preferences.interestIcons
        : {},
  };
}

function serializeChatMessages(
  messages: Array<{
    id: string;
    role: string;
    content: string;
    metadata: unknown;
    createdAt: Date;
  }>,
): ChatMessage[] {
  return messages.map((message) => {
    const base: ChatMessage = {
      id: message.id,
      role: message.role as ChatMessage["role"],
      content: message.content,
      timestamp: message.createdAt.toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    return applyChatMessageMetadata(base, message.metadata);
  });
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

function buildSerializedPins(
  pins: Array<{
    id: string;
    label: string;
    lat: number;
    lng: number;
    description: string | null;
    address: string | null;
    placeId: string | null;
    photoUrl: string | null;
    thumbnail: string | null;
    openingHours: string | null;
    phoneNumber: string | null;
    website: string | null;
    googleMapsUrl: string | null;
    rating: number | null;
    userRatingsTotal: number | null;
    color: string | null;
    source: string | null;
    confidence: number | null;
    verified: boolean | null;
    linkedTripItemId: string | null;
    dayNumber: number | null;
  }>,
): MapPin[] {
  return pins.filter((pin) => hasUsableMapCoordinate(pin)).map((pin) => ({
    id: pin.id,
    name: pin.label,
    lat: pin.lat,
    lng: pin.lng,
    description: pin.description || pin.label,
    address: pin.address || undefined,
    placeId: pin.placeId || undefined,
    photoUrl: pin.photoUrl || undefined,
    thumbnail: pin.thumbnail || undefined,
    openingHours: pin.openingHours || undefined,
    phoneNumber: pin.phoneNumber || undefined,
    website: pin.website || undefined,
    googleMapsUrl: pin.googleMapsUrl || undefined,
    rating: pin.rating ?? undefined,
    userRatingsTotal: pin.userRatingsTotal ?? undefined,
    color: pin.color || undefined,
    linkedTripItemId: pin.linkedTripItemId || undefined,
    dayNumber: pin.dayNumber || undefined,
    source: (pin.source || "itinerary") as MapPin["source"],
    confidence: pin.confidence ?? undefined,
    verified: pin.verified ?? undefined,
  }));
}

function resolveSerializedItemLocation(
  item: {
    id: string;
    day: number;
    title: string;
    description: string | null;
    timeSlot: string | null;
    itemType: string | null;
    source: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    locationDesc: string | null;
    locationAddress: string | null;
    placeId: string | null;
    photoUrl: string | null;
    thumbnail: string | null;
    openingHours: string | null;
    phoneNumber: string | null;
    website: string | null;
    googleMapsUrl: string | null;
    rating: number | null;
    userRatingsTotal: number | null;
    confidence: number | null;
    verified: boolean | null;
  },
  pins: MapPin[],
): TripPlanItem["location"] {
  if (
    item.location &&
    item.latitude != null &&
    item.longitude != null &&
    hasUsableMapCoordinate({ lat: item.latitude, lng: item.longitude })
  ) {
    return {
      name: item.location,
      lat: item.latitude,
      lng: item.longitude,
      description: item.locationDesc || item.description || `${item.location} stop`,
      address: item.locationAddress || item.location,
      placeId: item.placeId || undefined,
      photoUrl: item.photoUrl || undefined,
      thumbnail: item.thumbnail || undefined,
      openingHours: item.openingHours || undefined,
      phoneNumber: item.phoneNumber || undefined,
      website: item.website || undefined,
      googleMapsUrl: item.googleMapsUrl || undefined,
      rating: item.rating ?? undefined,
      userRatingsTotal: item.userRatingsTotal ?? undefined,
      confidence: item.confidence ?? undefined,
      verified: item.verified ?? undefined,
    };
  }

  const stubItem: TripPlanItem = {
    id: item.id,
    dayNumber: item.day,
    time: item.timeSlot || "09:00",
    title: item.title,
    type: (item.itemType || "activity") as TripPlanItem["type"],
    location: item.location?.trim()
      ? {
          name: item.location.trim(),
          lat: 0,
          lng: 0,
          description: item.locationDesc || item.description || item.location.trim(),
        }
      : undefined,
  };
  const linkedPin = findLinkedPinForItem(stubItem, pins);
  if (!linkedPin || !hasUsableMapCoordinate(linkedPin)) {
    return undefined;
  }

  return {
    name: linkedPin.name,
    lat: linkedPin.lat,
    lng: linkedPin.lng,
    description: item.description || linkedPin.description || linkedPin.name,
    address: linkedPin.address || item.locationAddress || item.location || undefined,
    placeId: linkedPin.placeId || item.placeId || undefined,
    photoUrl: linkedPin.photoUrl || item.photoUrl || undefined,
    thumbnail: linkedPin.thumbnail || item.thumbnail || undefined,
    openingHours: linkedPin.openingHours || item.openingHours || undefined,
    phoneNumber: linkedPin.phoneNumber || item.phoneNumber || undefined,
    website: linkedPin.website || item.website || undefined,
    googleMapsUrl: linkedPin.googleMapsUrl || item.googleMapsUrl || undefined,
    rating: linkedPin.rating ?? item.rating ?? undefined,
    userRatingsTotal: linkedPin.userRatingsTotal ?? item.userRatingsTotal ?? undefined,
    confidence: linkedPin.confidence ?? item.confidence ?? undefined,
    verified: linkedPin.verified ?? item.verified ?? undefined,
  };
}

export function serializeTrip(trip: {
  id: string;
  title: string;
  coverImageUrl: string | null;
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
    itemType: string | null;
    transportMode: string | null;
    transportDurationMinutes: number | null;
    transportDistanceMeters: number | null;
    transportDataSource: string | null;
    source: string | null;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    locationDesc: string | null;
    locationAddress: string | null;
    placeId: string | null;
    photoUrl: string | null;
    thumbnail: string | null;
    openingHours: string | null;
    phoneNumber: string | null;
    website: string | null;
    googleMapsUrl: string | null;
    rating: number | null;
    userRatingsTotal: number | null;
    confidence: number | null;
    verified: boolean | null;
    order: number;
  }>;
  pins: Array<{
    id: string;
    label: string;
    lat: number;
    lng: number;
    description: string | null;
    address: string | null;
    placeId: string | null;
    photoUrl: string | null;
    thumbnail: string | null;
    openingHours: string | null;
    phoneNumber: string | null;
    website: string | null;
    googleMapsUrl: string | null;
    rating: number | null;
    userRatingsTotal: number | null;
    color: string | null;
    source: string | null;
    confidence: number | null;
    verified: boolean | null;
    linkedTripItemId: string | null;
    dayNumber: number | null;
  }>;
}): PersistedTripPayload {
  const grouped = new Map<number, PersistedTripPayload["itinerary"][number]>();
  const orderedDays = [...trip.itineraryDays].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.dayNumber - right.dayNumber,
  );

  const serializedPins = buildSerializedPins(trip.pins);

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
      type: (item.itemType || "activity") as PersistedTripPayload["itinerary"][number]["items"][number]["type"],
      transport: item.transportMode || undefined,
      transportDurationMinutes: item.transportDurationMinutes ?? undefined,
      transportDistanceMeters: item.transportDistanceMeters ?? undefined,
      transportDataSource: item.transportDataSource === "google_routes" ? "google_routes" : undefined,
      notes: item.description || undefined,
      location: resolveSerializedItemLocation(item, serializedPins),
      source: (item.source || "manual") as PersistedTripPayload["itinerary"][number]["items"][number]["source"],
    });
  }

  const itinerary = Array.from(grouped.values()).sort((left, right) => left.dayNumber - right.dayNumber);
  const reconciled = reconcileTripMapState(itinerary, serializedPins);

  return {
    tripId: trip.id,
    title: trip.title,
    destination: trip.destination?.trim() || "",
    days: trip.days,
    coverImageUrl: trip.coverImageUrl ?? null,
    itinerary: reconciled.itinerary,
    pins: reconciled.pins,
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
        },
      },
    });
  }

  return prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
}

function parseProfilePreferencesRecord(preferences: unknown): Record<string, unknown> {
  if (preferences && typeof preferences === "object" && !Array.isArray(preferences)) {
    return { ...(preferences as Record<string, unknown>) };
  }
  return {};
}

async function persistProfilePreferences(userId: string, next: Record<string, unknown>) {
  await prisma.profile.upsert({
    where: { userId },
    update: { preferences: next as object },
    create: {
      userId,
      budget: null,
      destination: null,
      preferences: next as object,
    },
  });
}

/** 將 `activeTripId` 寫入 Profile.preferences（與既有 interests 等欄位合併）。 */
export async function setUserActiveTripId(userId: string, tripId: string | null) {
  await ensureProfile(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const merged = parseProfilePreferencesRecord(user.profile?.preferences);
  if (tripId) {
    merged.activeTripId = tripId;
  } else {
    delete merged.activeTripId;
  }
  await persistProfilePreferences(userId, merged);
}

/** 若目前選中的行程為指定 id，清除 preferences 中的 activeTripId（刪除行程前呼叫）。 */
export async function clearActiveTripIfMatches(userId: string, tripId: string) {
  await ensureProfile(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const prefs = parseProfilePreferencesRecord(user.profile?.preferences);
  const active = typeof prefs.activeTripId === "string" ? prefs.activeTripId : null;
  if (active === tripId) {
    await setUserActiveTripId(userId, null);
  }
}

export type TripLibraryListRow = {
  id: string;
  title: string;
  destination: string;
  days: number;
  coverImageUrl: string | null;
  folderId: string | null;
  folderName: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
};

async function deleteLegacyDefaultTrips(userId: string) {
  await prisma.trip.deleteMany({
    where: {
      userId,
      title: "未命名行程",
      OR: [{ destination: null }, { destination: "" }],
      items: { none: {} },
      pins: { none: {} },
    },
  });
}

/** 寫入資料庫用的行程標題：空白則依目的地給預設；無目的地時保持空白。 */
export function normalizeTripStorageTitle(
  title: string | null | undefined,
  destination: string | null | undefined,
): string {
  const t = typeof title === "string" ? title.trim() : "";
  if (t.length > 0) {
    return t;
  }
  const d = typeof destination === "string" ? destination.trim() : "";
  if (d.length > 0) {
    return `${d} 行程`;
  }
  return "";
}

export function assignFreshIdsForNewTripPayload(input: PersistedTripPayload): PersistedTripPayload {
  const itemIdMap = new Map<string, string>();

  const itinerary = input.itinerary.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      const nextId = randomUUID();
      itemIdMap.set(item.id, nextId);
      return {
        ...item,
        id: nextId,
      };
    }),
  }));

  const pins = input.pins.map((pin) => ({
    ...pin,
    id: randomUUID(),
    linkedTripItemId: pin.linkedTripItemId ? itemIdMap.get(pin.linkedTripItemId) : undefined,
  }));

  return {
    ...input,
    tripId: "",
    itinerary,
    pins,
  };
}

/** 行程資料夾列表：mine 僅本人擁有；recent 含本人與協作；shared 僅他人擁有且本人為協作者。 */
export async function listTripsForLibrary(
  userId: string,
  scope: "recent" | "mine" | "shared",
): Promise<TripLibraryListRow[]> {
  await deleteLegacyDefaultTrips(userId);

  const where =
    scope === "mine"
      ? { userId }
      : scope === "shared"
        ? {
            AND: [{ collaborators: { some: { userId } } }, { userId: { not: userId } }],
          }
        : {
            OR: [{ userId }, { collaborators: { some: { userId } } }],
          };

  const trips = await prisma.trip.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      destination: true,
      days: true,
      folderId: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      folder: { select: { name: true } },
    },
  });

  return trips.map((trip) => ({
    id: trip.id,
    title: trip.title?.trim() || (trip.destination?.trim() ? `${trip.destination} 行程` : ""),
    destination: trip.destination?.trim() || "尚未設定",
    days: trip.days,
    coverImageUrl: trip.coverImageUrl ?? null,
    folderId: trip.folderId,
    folderName: trip.folder?.name ?? null,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    isOwner: trip.userId === userId,
  }));
}

const tripIncludeFull = { itineraryDays: true, items: true, pins: true } as const;

/**
 * 解析目前工作階段應載入的行程：preferences.activeTripId、本人最近行程、協作行程；
 * 若皆無則回傳 null，避免自動建立預設行程。
 */
export async function resolveSessionTrip(userId: string) {
  await ensureProfile(userId);
  await deleteLegacyDefaultTrips(userId);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const prefs = parseProfilePreferencesRecord(user.profile?.preferences);
  const activeTripId = typeof prefs.activeTripId === "string" ? prefs.activeTripId : null;

  if (activeTripId) {
    const access = await getTripAccess(userId, activeTripId);
    if (access) {
      const active = await prisma.trip.findUnique({
        where: { id: activeTripId },
        include: tripIncludeFull,
      });
      if (active) {
        return active;
      }
    }
    delete prefs.activeTripId;
    await persistProfilePreferences(userId, prefs);
  }

  const existing = await prisma.trip.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: tripIncludeFull,
  });

  if (existing) {
    return existing;
  }

  const collabTrip = await prisma.trip.findFirst({
    where: { collaborators: { some: { userId } } },
    orderBy: { updatedAt: "desc" },
    include: tripIncludeFull,
  });

  if (collabTrip) {
    return collabTrip;
  }

  return null;
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
  const tripRecord = await resolveSessionTrip(userId);
  const messages = await prisma.chatMessage.findMany({
    where: tripRecord?.id ? { userId, tripId: tripRecord.id } : { userId, tripId: null },
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
  const preferredTransport =
    typeof profile.preferredTransport === "string" && profile.preferredTransport.trim()
      ? profile.preferredTransport.trim()
      : null;

  const room = tripRecord ? await ensureCollaborationRoom(tripRecord.id) : null;
  const serializedTrip = tripRecord
    ? serializeTrip({
        ...tripRecord,
        itineraryDays: tripRecord.itineraryDays,
        items: tripRecord.items,
        pins: tripRecord.pins,
      })
    : null;
  let tripPayload = serializedTrip
    ? sanitizeBootstrapTrip({
        trip: serializedTrip,
        profile,
        chatMessages,
      })
    : null;
  if (tripPayload?.tripId) {
    const repaired = await repairTripHydration(tripPayload, { preferredTransport });
    if (repaired.changed) {
      await saveTripPayload(userId, {
        ...repaired.trip,
        updatedAt: new Date().toISOString(),
      });
    }
    tripPayload = repaired.trip;
  }

  const prefs = parseProfilePreferencesRecord(user.profile?.preferences);
  const welcomeSaved = prefs.welcomeCompleted === true;
  const tripStopCount = tripPayload?.itinerary.reduce((count, day) => count + day.items.length, 0) ?? 0;
  const onboardingCompleted =
    welcomeSaved ||
    Boolean(user.profile?.destination?.trim()) ||
    (user.profile?.budget ?? 0) > 0 ||
    tripStopCount > 0 ||
    (tripPayload?.pins.length ?? 0) > 0 ||
    (tripPayload?.days ?? 0) > 1 ||
    Boolean(tripPayload?.title?.trim()) ||
    Boolean(tripPayload?.destination?.trim()) ||
    chatMessages.length > 0;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    profile,
    onboardingCompleted,
    trip: tripPayload,
    chatMessages,
    collaboration: room ? serializeCollaboration(room) : null,
  };
}

export async function getTripSwitchPayload(userId: string, tripId: string) {
  const [user, tripRecord, messages] = await Promise.all([
    ensureProfile(userId),
    prisma.trip.findUnique({
      where: { id: tripId },
      include: tripIncludeFull,
    }),
    prisma.chatMessage.findMany({
      where: { userId, tripId },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);

  if (!tripRecord) {
    throw new Error("not_found");
  }

  const room = await ensureCollaborationRoom(tripRecord.id);
  const profile = toUserProfile({
    name: user.name,
    email: user.email,
    preferences: user.profile?.preferences,
    budget: user.profile?.budget,
    destination: user.profile?.destination,
  });
  const repaired = await repairTripHydration(
    {
      ...serializeTrip({
        ...tripRecord,
        itineraryDays: tripRecord.itineraryDays,
        items: tripRecord.items,
        pins: tripRecord.pins,
      }),
      budget: user.profile?.budget ?? 0,
    },
    {
      preferredTransport:
        typeof profile.preferredTransport === "string" && profile.preferredTransport.trim()
          ? profile.preferredTransport.trim()
          : null,
    },
  );
  if (repaired.changed) {
    await saveTripPayload(userId, {
      ...repaired.trip,
      updatedAt: new Date().toISOString(),
    });
  }
  return {
    trip: repaired.trip,
    chatMessages: serializeChatMessages(messages),
    collaboration: serializeCollaboration(room),
  };
}

export async function updateProfile(userId: string, input: Partial<User> & { welcomeCompleted?: boolean }) {
  const existing = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  const prev = parseProfilePreferencesRecord(existing?.profile?.preferences);
  const prevInterests = Array.isArray(prev.interests) ? (prev.interests as string[]) : [];
  const prevPace = prev.pace;
  const nextPace =
    input.travelPace !== undefined
      ? input.travelPace === ""
        ? null
        : input.travelPace
      : prevPace === "relaxed" || prevPace === "moderate" || prevPace === "intensive"
        ? prevPace
        : null;

  const nextTravelDays =
    typeof input.travelDays === "number" && Number.isFinite(input.travelDays)
      ? Math.max(0, Math.min(30, Math.floor(input.travelDays)))
      : typeof prev.travelDays === "number"
        ? Math.max(0, Math.min(30, Math.floor(prev.travelDays as number)))
        : undefined;

  const prevInterestIcons =
    prev.interestIcons && typeof prev.interestIcons === "object" && !Array.isArray(prev.interestIcons)
      ? (prev.interestIcons as Record<string, string>)
      : {};

  const preferences: Record<string, unknown> = {
    ...prev,
    interests: input.interests ?? input.travelPreferences ?? prevInterests,
    preferredTransport:
      input.preferredTransport !== undefined
        ? input.preferredTransport.trim()
        : typeof prev.preferredTransport === "string"
          ? prev.preferredTransport
          : "",
  };

  if (input.interestIcons !== undefined) {
    if (Object.keys(input.interestIcons).length === 0) {
      delete preferences.interestIcons;
    } else {
      preferences.interestIcons = input.interestIcons;
    }
  } else if (Object.keys(prevInterestIcons).length > 0) {
    preferences.interestIcons = prevInterestIcons;
  }

  if (nextPace === null) {
    delete preferences.pace;
  } else {
    preferences.pace = nextPace;
  }

  if (nextTravelDays !== undefined) {
    if (nextTravelDays <= 0) {
      delete preferences.travelDays;
    } else {
      preferences.travelDays = nextTravelDays;
    }
  }

  if (input.welcomeCompleted === true) {
    preferences.welcomeCompleted = true;
  }

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
            preferences: preferences as Prisma.InputJsonValue,
          },
          create: {
            budget: input.budget,
            destination: input.destination,
            preferences: preferences as Prisma.InputJsonValue,
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

type SaveTripPayloadFailureInjection = {
  failAfter?: "delete_existing_days" | "create_days" | "create_items";
};

function throwInjectedSaveFailure(
  injection: SaveTripPayloadFailureInjection | undefined,
  point: SaveTripPayloadFailureInjection["failAfter"],
) {
  if (injection?.failAfter === point) {
    throw new Error(`injected failure: ${point}`);
  }
}

export async function saveTripPayload(
  userId: string,
  input: PersistedTripPayload,
  testFailureInjection?: SaveTripPayloadFailureInjection,
) {
  if (input.tripId) {
    await requireTripAccess(userId, input.tripId, "edit");
  }

  const payload = input.tripId ? input : assignFreshIdsForNewTripPayload(input);

  const coverPatch =
    payload.coverImageUrl !== undefined
      ? {
          coverImageUrl:
            payload.coverImageUrl !== null && payload.coverImageUrl.trim().length > 0
              ? payload.coverImageUrl.trim()
              : null,
        }
      : undefined;

  const resolvedTitle = normalizeTripStorageTitle(payload.title, payload.destination);

  const normalizedDays = payload.itinerary;

  const freshTrip = await prisma.$transaction(async (tx) => {
    const trip = payload.tripId
      ? await tx.trip.upsert({
          where: { id: payload.tripId },
          update: {
            title: resolvedTitle,
            destination: payload.destination,
            days: Math.max(0, payload.itinerary.length || payload.days),
            ...(coverPatch ?? {}),
          },
          create: {
            userId,
            title: resolvedTitle,
            destination: payload.destination,
            days: Math.max(0, payload.itinerary.length || payload.days),
            ...(coverPatch ?? {}),
          },
        })
      : await tx.trip.create({
          data: {
            userId,
            title: resolvedTitle,
            destination: payload.destination,
            days: Math.max(0, payload.itinerary.length || payload.days),
            ...(coverPatch ?? {}),
          },
        });

    await tx.tripDay.deleteMany({ where: { tripId: trip.id } });
    await tx.tripItem.deleteMany({ where: { tripId: trip.id } });
    await tx.mapPin.deleteMany({ where: { tripId: trip.id } });
    throwInjectedSaveFailure(testFailureInjection, "delete_existing_days");

    if (normalizedDays.length > 0) {
      await tx.tripDay.createMany({
        data: normalizedDays.map((day, index) => ({
          tripId: trip.id,
          dayNumber: day.dayNumber,
          theme: day.theme || null,
          summary: day.summary || null,
          sortOrder: index,
        })),
      });
    }
    throwInjectedSaveFailure(testFailureInjection, "create_days");

    const items = normalizedDays.flatMap((day) =>
      day.items.map((item, index) => {
        const location = hasUsableMapCoordinate(item.location) ? item.location : undefined;
        return {
          id: item.id,
          tripId: trip.id,
          day: day.dayNumber,
          title: item.title,
          description: item.notes || null,
          timeSlot: item.time,
          itemType: item.type,
          transportMode: item.transport || null,
          transportDurationMinutes: item.transportDurationMinutes ?? null,
          transportDistanceMeters: item.transportDistanceMeters ?? null,
          transportDataSource: item.transportDataSource ?? null,
          source: item.source || "manual",
          location: location?.name || null,
          latitude: location?.lat ?? null,
          longitude: location?.lng ?? null,
          locationDesc: location?.description || null,
          locationAddress: location?.address || null,
          placeId: location?.placeId || null,
          photoUrl: location?.photoUrl || null,
          thumbnail: location?.thumbnail || null,
          openingHours: location?.openingHours || null,
          phoneNumber: location?.phoneNumber || null,
          website: location?.website || null,
          googleMapsUrl: location?.googleMapsUrl || null,
          rating: location?.rating ?? null,
          userRatingsTotal: location?.userRatingsTotal ?? null,
          confidence: location?.confidence ?? null,
          verified: location?.verified ?? null,
          order: index,
        };
      }),
    );

    if (items.length > 0) {
      await tx.tripItem.createMany({
        data: items,
        skipDuplicates: true,
      });
    }
    throwInjectedSaveFailure(testFailureInjection, "create_items");

    const validPins = payload.pins.filter((pin) => hasUsableMapCoordinate(pin));
    if (validPins.length > 0) {
      await tx.mapPin.createMany({
        data: validPins.map((pin) => ({
          id: pin.id,
          tripId: trip.id,
          label: pin.name,
          lat: pin.lat,
          lng: pin.lng,
          description: pin.description,
          address: pin.address || null,
          placeId: pin.placeId || null,
          photoUrl: pin.photoUrl || null,
          thumbnail: pin.thumbnail || null,
          openingHours: pin.openingHours || null,
          phoneNumber: pin.phoneNumber || null,
          website: pin.website || null,
          googleMapsUrl: pin.googleMapsUrl || null,
          rating: pin.rating ?? null,
          userRatingsTotal: pin.userRatingsTotal ?? null,
          color: pin.color || null,
          source: pin.source || "manual",
          confidence: pin.confidence ?? null,
          verified: pin.verified ?? null,
          linkedTripItemId: pin.linkedTripItemId || null,
          dayNumber: pin.dayNumber || null,
        })),
        skipDuplicates: true,
      });
    }

    return tx.trip.findUniqueOrThrow({
      where: { id: trip.id },
      include: { itineraryDays: true, items: true, pins: true },
    });
  });

  await ensureCollaborationRoom(freshTrip.id);
  return serializeTrip(freshTrip);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 取得複製命名用的「原名」：去掉尾端 `-（複製N）` 或舊版 `（複製）`。 */
function stemTripTitleForDuplicate(raw: string): string {
  let t = raw.trim();
  if (!t) {
    return t;
  }
  for (;;) {
    const numbered = t.match(/^(.+)-（複製\d+）$/);
    if (numbered) {
      t = numbered[1].trim();
      continue;
    }
    if (t.endsWith("（複製）")) {
      t = t.slice(0, -"（複製）".length).trim();
      continue;
    }
    break;
  }
  return t || raw.trim();
}

async function computeNextDuplicateTripTitle(userId: string, sourceTitle: string): Promise<string> {
  const stem = stemTripTitleForDuplicate(sourceTitle);
  const safeStem = stem.length > 0 ? stem : sourceTitle.trim() || "行程";
  const rows = await prisma.trip.findMany({
    where: { userId },
    select: { title: true },
  });
  const suffixRe = new RegExp(`^${escapeRegExp(safeStem)}-（複製(\\d+)）$`);
  let maxN = 0;
  for (const row of rows) {
    const tt = row.title?.trim() || "";
    const m = tt.match(suffixRe);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) {
        maxN = Math.max(maxN, n);
      }
    }
  }
  return `${safeStem}-（複製${maxN + 1}）`;
}

/** 以目前使用者身分複製一份行程（含天數、項目與圖釘）；需至少具備檢視權限。 */
export async function duplicateTripForUser(userId: string, sourceTripId: string): Promise<{ tripId: string }> {
  await requireTripAccess(userId, sourceTripId, "view");
  const source = await prisma.trip.findUnique({
    where: { id: sourceTripId },
    include: tripIncludeFull,
  });
  if (!source) {
    throw new Error("not_found");
  }

  const serialized = serializeTrip(source);
  const nextTitle = await computeNextDuplicateTripTitle(userId, serialized.title);
  const copyPayload: PersistedTripPayload = {
    ...serialized,
    tripId: "",
    title: nextTitle,
    pins: serialized.pins.map((pin) => ({
      ...pin,
      linkedTripItemId: undefined,
    })),
  };

  const saved = await saveTripPayload(userId, copyPayload);
  return { tripId: saved.tripId };
}

export async function saveChatMessage(
  userId: string,
  role: string,
  content: string,
  tripId?: string,
  structuredSource?: ChatMessage,
) {
  const structured = structuredSource ? extractChatMessageMetadata(structuredSource) : null;
  return prisma.chatMessage.create({
    data: {
      userId,
      role,
      content,
      tripId,
      metadata: structured ? (structured as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function clearUserChatMessages(userId: string): Promise<number> {
  const result = await prisma.chatMessage.deleteMany({ where: { userId } });
  return result.count;
}

function serializeComments(
  comments: Array<{
    id: string;
    authorId: string;
    content: string;
    createdAt: Date;
    author: { name: string | null; image: string | null };
  }>,
): CollaborativeComment[] {
  return comments.map((comment, index) => ({
    id: comment.id,
    authorId: comment.authorId,
    author: comment.author.name || "AIYO user",
    authorAvatar: comment.author.image || undefined,
    content: comment.content,
    color: ["#FFDAB9", "#B8D8BA", "#C3B1E1", "#F4A7B9"][index % 4],
    position: { x: 0, y: 0 },
    createdAt: comment.createdAt.toISOString(),
  }));
}

function serializePresence(
  presences: Array<{
    userId: string;
    activeSection: string | null;
    selectedEntityId: string | null;
    cursorX: number | null;
    cursorY: number | null;
    online: boolean;
    user: { name: string | null };
  }>,
): EditingPresence[] {
  return presences
    .filter((entry) => entry.online)
    .map((entry, index) => ({
      userId: entry.userId,
      userName: entry.user.name || "AIYO user",
      cursorPosition: {
        x: entry.cursorX ?? 30 + index * 25,
        y: entry.cursorY ?? 40 + index * 18,
      },
      color: ["#7C9CBF", "#F4A7B9", "#B8D8BA", "#C3B1E1"][index % 4],
      activeSection: entry.activeSection || "workspace",
    }));
}

function serializeCollaboration(room: {
  id: string;
  inviteCode: string;
  tripId: string;
  comments: Array<{
    id: string;
    authorId: string;
    content: string;
    createdAt: Date;
    author: { name: string | null; image: string | null };
  }>;
  presences: Array<{
    userId: string;
    activeSection: string | null;
    selectedEntityId: string | null;
    cursorX: number | null;
    cursorY: number | null;
    online: boolean;
    user: { id: string; name: string | null; image: string | null };
  }>;
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
    shareLink: `/itinerary?invite=${room.inviteCode}`,
    comments: serializeComments(room.comments),
    presence: serializePresence(room.presences),
    members: Array.from(memberMap.values()),
  };
}

export async function getCollaborationState(tripId: string) {
  const room = await ensureCollaborationRoom(tripId);
  return serializeCollaboration(room);
}

export async function deleteComment(roomId: string, commentId: string, userId: string) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, roomId },
    include: {
      room: {
        include: {
          trip: { select: { userId: true } },
        },
      },
    },
  });
  if (!comment) {
    throw new Error("not_found");
  }
  const isAuthor = comment.authorId === userId;
  const isTripOwner = comment.room.trip.userId === userId;
  if (!isAuthor && !isTripOwner) {
    throw new Error("forbidden");
  }
  await prisma.comment.delete({
    where: { id: commentId },
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
  cursorX?: number | null;
  cursorY?: number | null;
}) {
  const roomExists = await prisma.collaborationRoom.findUnique({
    where: { id: input.roomId },
    select: { id: true },
  });
  if (!roomExists) {
    throw new Error("presence_room_not_found");
  }

  const userExists = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (!userExists) {
    throw new Error("presence_user_not_found");
  }

  const update: {
    activeSection?: string | null;
    selectedEntityId?: string | null;
    cursorX?: number | null;
    cursorY?: number | null;
    online: boolean;
    lastSeenAt: Date;
  } = {
    online: true,
    lastSeenAt: new Date(),
  };
  if (input.activeSection !== undefined) {
    update.activeSection = input.activeSection;
  }
  if (input.selectedEntityId !== undefined) {
    update.selectedEntityId = input.selectedEntityId;
  }
  if (input.cursorX !== undefined) {
    update.cursorX = input.cursorX;
  }
  if (input.cursorY !== undefined) {
    update.cursorY = input.cursorY;
  }

  await prisma.collaborationPresence.upsert({
    where: {
      roomId_userId: {
        roomId: input.roomId,
        userId: input.userId,
      },
    },
    update,
    create: {
      roomId: input.roomId,
      userId: input.userId,
      activeSection: input.activeSection ?? null,
      selectedEntityId: input.selectedEntityId ?? null,
      cursorX: input.cursorX ?? null,
      cursorY: input.cursorY ?? null,
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
