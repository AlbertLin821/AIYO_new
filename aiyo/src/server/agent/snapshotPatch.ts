import type { Prisma } from "@prisma/client";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import type { PersistedTripPayload } from "@/types";

function itemRow(item: PersistedTripPayload["itinerary"][number]["items"][number], day: number, order: number) {
  const location = hasUsableMapCoordinate(item.location) ? item.location : undefined;
  return {
    day, order, title: item.title, description: item.notes || null, timeSlot: item.time,
    itemType: item.type, transportMode: item.transport || null,
    transportDurationMinutes: item.transportDurationMinutes ?? null,
    transportDistanceMeters: item.transportDistanceMeters ?? null,
    transportDataSource: item.transportDataSource ?? null, source: item.source || "ai",
    location: location?.name || null, latitude: location?.lat ?? null, longitude: location?.lng ?? null,
    locationDesc: location?.description || null, locationAddress: location?.address || null,
    placeProvider: location?.resolvedFrom || null,
    placeCheckedAt: location?.checkedAt ? new Date(location.checkedAt) : null,
    placeCategory: location?.category || null, placeId: location?.placeId || null,
    photoUrl: location?.photoUrl || null, thumbnail: location?.thumbnail || null,
    openingHours: location?.openingHours || null, phoneNumber: location?.phoneNumber || null,
    website: location?.website || null, googleMapsUrl: location?.googleMapsUrl || null,
    rating: location?.rating ?? null, userRatingsTotal: location?.userRatingsTotal ?? null,
    confidence: location?.confidence ?? null, verified: location?.verified ?? null,
  };
}

function pinRow(pin: PersistedTripPayload["pins"][number]) {
  return {
    label: pin.name, lat: pin.lat, lng: pin.lng, description: pin.description,
    address: pin.address || null, placeProvider: pin.placeProvider || null,
    placeCheckedAt: pin.placeCheckedAt ? new Date(pin.placeCheckedAt) : null,
    placeCategory: pin.placeCategory || null, placeId: pin.placeId || null,
    photoUrl: pin.photoUrl || null, thumbnail: pin.thumbnail || null,
    openingHours: pin.openingHours || null, phoneNumber: pin.phoneNumber || null,
    website: pin.website || null, googleMapsUrl: pin.googleMapsUrl || null,
    rating: pin.rating ?? null, userRatingsTotal: pin.userRatingsTotal ?? null,
    color: pin.color || null, source: pin.source || "itinerary",
    confidence: pin.confidence ?? null, verified: pin.verified ?? null,
    linkedTripItemId: pin.linkedTripItemId || null, dayNumber: pin.dayNumber || null,
  };
}

/** Apply a validated preview inside the caller's revision-guarded transaction. */
export async function applySnapshotPatch(tx: Prisma.TransactionClient, tripId: string, result: PersistedTripPayload) {
  const [currentItems, currentPins] = await Promise.all([
    tx.tripItem.findMany({ where: { tripId }, select: { id: true } }),
    tx.mapPin.findMany({ where: { tripId }, select: { id: true } }),
  ]);
  const itemIds = new Set(result.itinerary.flatMap((day) => day.items.map((item) => item.id)));
  const pinIds = new Set(result.pins.map((pin) => pin.id));
  await tx.tripItem.deleteMany({ where: { tripId, id: { in: currentItems.filter((item) => !itemIds.has(item.id)).map((item) => item.id) } } });
  await tx.mapPin.deleteMany({ where: { tripId, id: { in: currentPins.filter((pin) => !pinIds.has(pin.id)).map((pin) => pin.id) } } });
  const existingItemIds = new Set(currentItems.map((item) => item.id));
  const existingPinIds = new Set(currentPins.map((pin) => pin.id));
  for (const day of result.itinerary) {
    for (const [order, item] of day.items.entries()) {
      const data = itemRow(item, day.dayNumber, order);
      if (existingItemIds.has(item.id)) {
        await tx.tripItem.update({ where: { id: item.id, tripId }, data });
      } else {
        await tx.tripItem.create({ data: { id: item.id, tripId, ...data } });
      }
    }
  }
  for (const pin of result.pins.filter((candidate) => hasUsableMapCoordinate(candidate))) {
    const data = pinRow(pin);
    if (existingPinIds.has(pin.id)) {
      await tx.mapPin.update({ where: { id: pin.id, tripId }, data });
    } else {
      await tx.mapPin.create({ data: { id: pin.id, tripId, ...data } });
    }
  }
}
