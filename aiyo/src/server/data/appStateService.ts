import { prisma } from "@/lib/prisma";
import { getTripAccess, requireTripAccess } from "@/server/tripAccess";
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
    coverImageUrl: trip.coverImageUrl ?? null,
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

/** 寫入資料庫用的行程標題：空白則依目的地給預設，否則為「未命名行程」。 */
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
  return "未命名行程";
}

/** 行程資料夾列表：mine 僅本人擁有；recent 含本人與協作；shared 僅他人擁有且本人為協作者。 */
export async function listTripsForLibrary(
  userId: string,
  scope: "recent" | "mine" | "shared",
): Promise<TripLibraryListRow[]> {
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
    title: trip.title?.trim() || (trip.destination?.trim() ? `${trip.destination} 行程` : "未命名行程"),
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

const defaultTripPayloadForCreate: PersistedTripPayload = {
  tripId: "",
  title: "",
  destination: "",
  days: 1,
  budget: 0,
  coverImageUrl: null,
  itinerary: [
    {
      dayNumber: 1,
      theme: "Day 1",
      summary: "尚未安排內容",
      items: [],
    },
  ],
  pins: [],
  updatedAt: "",
};

/** 建立一筆空白擁有行程並載入完整關聯（供刪光行程後或首次載入補齊至少一筆）。 */
export async function createDefaultOwnedTrip(userId: string) {
  const persisted = await saveTripPayload(userId, {
    ...defaultTripPayloadForCreate,
    updatedAt: new Date().toISOString(),
  });
  return prisma.trip.findUniqueOrThrow({
    where: { id: persisted.tripId },
    include: tripIncludeFull,
  });
}

/**
 * 擁有者刪除行程後：若已無任何「本人擁有」的行程，建立預設行程並在必要時寫入 activeTripId。
 */
export async function ensureAtLeastOneOwnedTripAfterDelete(ownerUserId: string) {
  const ownedLeft = await prisma.trip.count({ where: { userId: ownerUserId } });
  if (ownedLeft > 0) {
    return;
  }
  const fresh = await createDefaultOwnedTrip(ownerUserId);
  await ensureProfile(ownerUserId);
  const userRow = await prisma.user.findUniqueOrThrow({
    where: { id: ownerUserId },
    include: { profile: true },
  });
  const prefs = parseProfilePreferencesRecord(userRow.profile?.preferences);
  const active = typeof prefs.activeTripId === "string" ? prefs.activeTripId : null;
  if (!active) {
    await setUserActiveTripId(ownerUserId, fresh.id);
    return;
  }
  const access = await getTripAccess(ownerUserId, active);
  if (!access) {
    await setUserActiveTripId(ownerUserId, fresh.id);
  }
}

/**
 * 解析目前工作階段應載入的行程：preferences.activeTripId、本人最近行程、協作行程；
 * 若皆無則建立一筆預設擁有行程並設為使用中（至少一筆擁有行程）。
 */
export async function resolveSessionTrip(userId: string) {
  await ensureProfile(userId);
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

  const created = await createDefaultOwnedTrip(userId);
  await setUserActiveTripId(userId, created.id);
  return created;
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

  const room = await ensureCollaborationRoom(tripRecord.id);
  const tripPayload = sanitizeBootstrapTrip({
    trip: serializeTrip({
      ...tripRecord,
      itineraryDays: tripRecord.itineraryDays,
      items: tripRecord.items,
      pins: tripRecord.pins,
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
  const existing = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  const prev = parseProfilePreferencesRecord(existing?.profile?.preferences);
  const prevInterests = Array.isArray(prev.interests) ? (prev.interests as string[]) : [];
  const preferences = {
    ...prev,
    interests: input.interests ?? input.travelPreferences ?? prevInterests,
    preferredTransport:
      input.preferredTransport !== undefined
        ? input.preferredTransport.trim()
        : typeof prev.preferredTransport === "string"
          ? prev.preferredTransport
          : "",
    pace: input.travelPace ?? prev.pace ?? "moderate",
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
  if (input.tripId) {
    await requireTripAccess(userId, input.tripId, "edit");
  }

  const coverPatch =
    input.coverImageUrl !== undefined
      ? {
          coverImageUrl:
            input.coverImageUrl !== null && input.coverImageUrl.trim().length > 0
              ? input.coverImageUrl.trim()
              : null,
        }
      : undefined;

  const resolvedTitle = normalizeTripStorageTitle(input.title, input.destination);

  const trip = input.tripId
    ? await prisma.trip.upsert({
        where: { id: input.tripId },
        update: {
          title: resolvedTitle,
          destination: input.destination,
          days: Math.max(1, input.itinerary.length || input.days),
          ...(coverPatch ?? {}),
        },
        create: {
          userId,
          title: resolvedTitle,
          destination: input.destination,
          days: Math.max(1, input.itinerary.length || input.days),
          ...(coverPatch ?? {}),
        },
      })
    : await prisma.trip.create({
        data: {
          userId,
          title: resolvedTitle,
          destination: input.destination,
          days: Math.max(1, input.itinerary.length || input.days),
          ...(coverPatch ?? {}),
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
