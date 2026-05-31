import { dayNumberFromDayId } from "@/lib/assistantActions/converters";
import { prisma } from "@/lib/prisma";

export async function assertGeocodeTripItemScope(input: {
  tripId: string;
  dayId?: string;
  itemId?: string;
}): Promise<void> {
  if (!input.dayId && !input.itemId) {
    return;
  }

  const dayNumber = input.dayId ? dayNumberFromDayId(input.dayId) : null;
  if (input.dayId && !dayNumber) {
    throw new Error("invalid_request");
  }

  if (input.itemId) {
    const item = await prisma.tripItem.findFirst({
      where: { id: input.itemId, tripId: input.tripId },
      select: { id: true, day: true },
    });
    if (!item) {
      throw new Error("invalid_request");
    }
    if (dayNumber != null && item.day !== dayNumber) {
      throw new Error("invalid_request");
    }
    return;
  }

  if (dayNumber != null) {
    const day = await prisma.tripDay.findFirst({
      where: { tripId: input.tripId, dayNumber },
      select: { id: true },
    });
    if (!day) {
      throw new Error("invalid_request");
    }
  }
}
