import { prisma } from "@/lib/prisma";

export type TripRevisionEnvelope = { tripId: string; revision: number };

export async function getRoomTripRevision(userId: string, roomId: string): Promise<TripRevisionEnvelope> {
  const room = await prisma.collaborationRoom.findUnique({
    where: { id: roomId },
    select: { trip: { select: { id: true, revision: true, userId: true, collaborators: { where: { userId }, select: { id: true }, take: 1 } } } },
  });
  if (!room) throw new Error("not_found");
  if (room.trip.userId !== userId && room.trip.collaborators.length === 0) throw new Error("forbidden");
  return { tripId: room.trip.id, revision: room.trip.revision };
}
