import { prisma } from "@/lib/prisma";
import { serializeTrip } from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";
import type { ChatContext } from "@/types";

/** The selected trip is authoritative; browser itinerary state may still be switching. */
export async function loadAuthorizedChatContext(userId: string, tripId: string, client?: ChatContext): Promise<ChatContext> {
  await requireTripAccess(userId, tripId, "view");
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { itineraryDays: true, items: true, pins: true },
  });
  if (!trip) throw new Error("not_found");
  const saved = serializeTrip(trip);
  const selectedPin = trip.pins.find((pin) => pin.id === client?.selectedPlaceId);
  return {
    ...client,
    destination: saved.destination || undefined,
    days: saved.days,
    itinerary: saved.itinerary,
    selectedPlace: selectedPin ? { id: selectedPin.id, name: selectedPin.label, lat: selectedPin.lat, lng: selectedPin.lng } : undefined,
    destinationScope: undefined,
  };
}

export async function resolveAuthorizedChatTripContext(userId: string, requestedTripId?: string, client?: ChatContext): Promise<{ tripId?: string; context?: ChatContext }> {
  if (!requestedTripId) return { context: client };
  return { tripId: requestedTripId, context: await loadAuthorizedChatContext(userId, requestedTripId, client) };
}
