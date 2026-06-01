import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { saveTripPayload, serializeTrip } from "@/server/data/appStateService";
import type {
  LocationReference,
  MapPin,
  PersistedTripPayload,
  PublicItineraryDay,
  PublicItineraryDetail,
  PublicItineraryItem,
  PublicItinerarySnapshot,
  PublicItinerarySummary,
  TripPublicationStatus,
} from "@/types";

const tripIncludeFull = { itineraryDays: true, items: true, pins: true } as const;

function sanitizePublicLocation(
  location: PublicItineraryItem["location"],
): PublicItineraryItem["location"] | undefined {
  if (!location?.name?.trim()) {
    return undefined;
  }
  return {
    name: location.name.trim(),
    lat: location.lat,
    lng: location.lng,
    address: location.address,
    placeId: location.placeId,
    photoUrl: location.photoUrl,
    thumbnail: location.thumbnail,
    googleMapsUrl: location.googleMapsUrl,
    rating: location.rating,
    userRatingsTotal: location.userRatingsTotal,
  };
}

function sanitizePublicPin(pin: MapPin): MapPin {
  return {
    id: pin.id,
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    address: pin.address,
    placeId: pin.placeId,
    photoUrl: pin.photoUrl,
    thumbnail: pin.thumbnail,
    openingHours: pin.openingHours,
    phoneNumber: pin.phoneNumber,
    website: pin.website,
    googleMapsUrl: pin.googleMapsUrl,
    rating: pin.rating,
    userRatingsTotal: pin.userRatingsTotal,
    color: pin.color,
    linkedTripItemId: pin.linkedTripItemId,
    dayNumber: pin.dayNumber,
    source: pin.source,
    confidence: pin.confidence,
    verified: pin.verified,
    description: pin.name,
  };
}

/** Strip private fields from a serialized trip before public snapshot storage. */
export function buildPublicSnapshot(payload: PersistedTripPayload): PublicItinerarySnapshot {
  const itinerary: PublicItineraryDay[] = payload.itinerary.map((day) => ({
    dayNumber: day.dayNumber,
    items: day.items.map((item) => {
      const publicItem: PublicItineraryItem = {
        id: item.id,
        dayNumber: item.dayNumber,
        time: item.time,
        title: item.title,
        type: item.type,
        transport: item.transport,
        transportDurationMinutes: item.transportDurationMinutes,
        transportDistanceMeters: item.transportDistanceMeters,
        transportDataSource: item.transportDataSource,
        location: sanitizePublicLocation(item.location),
      };
      return publicItem;
    }),
  }));

  return {
    title: payload.title,
    destination: payload.destination,
    days: payload.days,
    coverImageUrl: payload.coverImageUrl ?? null,
    itinerary,
    pins: payload.pins.map(sanitizePublicPin),
  };
}

export function buildPublicationSearchText(snapshot: PublicItinerarySnapshot): string {
  const itemTitles = snapshot.itinerary.flatMap((day) => day.items.map((item) => item.title));
  return [snapshot.title, snapshot.destination, ...itemTitles]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function assertTripPublishable(payload: PersistedTripPayload): void {
  const dayCount = payload.itinerary.length;
  const itemCount = payload.itinerary.reduce((sum, day) => sum + day.items.length, 0);
  if (dayCount < 1 || itemCount < 1) {
    throw new Error("validation_error");
  }
}

function toPersistedLocation(
  location: PublicItineraryItem["location"],
): LocationReference | undefined {
  if (!location?.name?.trim()) {
    return undefined;
  }
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return undefined;
  }
  return {
    name: location.name.trim(),
    lat: location.lat,
    lng: location.lng,
    description: location.name.trim(),
    address: location.address,
    placeId: location.placeId,
    photoUrl: location.photoUrl,
    thumbnail: location.thumbnail,
    googleMapsUrl: location.googleMapsUrl,
    rating: location.rating,
    userRatingsTotal: location.userRatingsTotal,
  };
}

function snapshotToPersistedPayload(snapshot: PublicItinerarySnapshot): PersistedTripPayload {
  return {
    tripId: "",
    title: snapshot.title,
    destination: snapshot.destination,
    days: snapshot.days,
    coverImageUrl: snapshot.coverImageUrl ?? null,
    itinerary: snapshot.itinerary.map((day) => ({
      dayNumber: day.dayNumber,
      items: day.items.map((item) => ({
        id: item.id,
        dayNumber: item.dayNumber ?? day.dayNumber,
        time: item.time,
        title: item.title,
        type: item.type,
        transport: item.transport,
        transportDurationMinutes: item.transportDurationMinutes,
        transportDistanceMeters: item.transportDistanceMeters,
        transportDataSource: item.transportDataSource,
        location: toPersistedLocation(item.location),
      })),
    })),
    pins: snapshot.pins.map((pin) => ({
      ...pin,
      linkedTripItemId: undefined,
    })),
    updatedAt: new Date().toISOString(),
  };
}

function toSummary(row: {
  id: string;
  title: string;
  coverImageUrl: string | null;
  days: number;
  destination: string | null;
  publishedAt: Date;
  publisherImage: string | null;
}): PublicItinerarySummary {
  return {
    id: row.id,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    days: row.days,
    destination: row.destination,
    publishedAt: row.publishedAt.toISOString(),
    publisherImage: row.publisherImage,
  };
}

export async function getTripPublicationStatus(
  tripId: string,
): Promise<TripPublicationStatus> {
  const row = await prisma.tripPublication.findUnique({
    where: { tripId },
    select: { id: true, publishedAt: true, revokedAt: true },
  });
  if (!row || row.revokedAt) {
    return { published: false };
  }
  return {
    published: true,
    publicationId: row.id,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export async function publishTripForUser(
  userId: string,
  tripId: string,
): Promise<{ publicationId: string; publishedAt: string }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: tripIncludeFull,
  });
  if (!trip) {
    throw new Error("not_found");
  }
  if (trip.userId !== userId) {
    throw new Error("forbidden");
  }

  const publisher = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });

  const payload = serializeTrip(trip);
  assertTripPublishable(payload);
  const snapshot = buildPublicSnapshot(payload);
  const searchText = buildPublicationSearchText(snapshot);
  const now = new Date();

  const row = await prisma.tripPublication.upsert({
    where: { tripId },
    create: {
      tripId,
      publisherId: userId,
      title: snapshot.title,
      coverImageUrl: snapshot.coverImageUrl ?? null,
      days: snapshot.days,
      destination: snapshot.destination || null,
      searchText,
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      publisherImage: publisher?.image ?? null,
      publishedAt: now,
      revokedAt: null,
    },
    update: {
      title: snapshot.title,
      coverImageUrl: snapshot.coverImageUrl ?? null,
      days: snapshot.days,
      destination: snapshot.destination || null,
      searchText,
      snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
      publisherImage: publisher?.image ?? null,
      publishedAt: now,
      revokedAt: null,
    },
  });

  return {
    publicationId: row.id,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export async function unpublishTripForUser(userId: string, tripId: string): Promise<void> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { userId: true },
  });
  if (!trip) {
    throw new Error("not_found");
  }
  if (trip.userId !== userId) {
    throw new Error("forbidden");
  }

  await prisma.tripPublication.updateMany({
    where: { tripId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function listPublicItineraries(input: {
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ items: PublicItinerarySummary[]; nextCursor?: string }> {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);
  const q = input.q?.trim().toLowerCase();

  const rows = await prisma.tripPublication.findMany({
    where: {
      revokedAt: null,
      ...(q ? { searchText: { contains: q, mode: "insensitive" } } : {}),
      ...(input.cursor
        ? {
            publishedAt: {
              lt: new Date(input.cursor),
            },
          }
        : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      title: true,
      coverImageUrl: true,
      days: true,
      destination: true,
      publishedAt: true,
      publisherImage: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.publishedAt.toISOString() : undefined;

  return {
    items: page.map(toSummary),
    nextCursor,
  };
}

export async function getPublicItineraryDetail(
  publicationId: string,
): Promise<PublicItineraryDetail> {
  const row = await prisma.tripPublication.findUnique({
    where: { id: publicationId },
  });
  if (!row || row.revokedAt) {
    throw new Error("not_found");
  }

  return {
    ...toSummary(row),
    snapshot: row.snapshotJson as unknown as PublicItinerarySnapshot,
  };
}

export async function copyPublicItineraryForUser(
  userId: string,
  publicationId: string,
): Promise<{ tripId: string }> {
  const detail = await getPublicItineraryDetail(publicationId);
  const base = snapshotToPersistedPayload(detail.snapshot);
  const copyPayload: PersistedTripPayload = {
    ...base,
    title: `${detail.title}（複製）`,
  };
  const saved = await saveTripPayload(userId, copyPayload);
  return { tripId: saved.tripId };
}
