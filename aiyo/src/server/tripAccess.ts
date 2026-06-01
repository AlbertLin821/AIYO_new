import { prisma } from "@/lib/prisma";
import { canCollaborator, type CollaboratorRole } from "@/lib/permissions";

export type TripAccess = {
  tripId: string;
  userId: string;
  role: CollaboratorRole;
  isOwner: boolean;
};

function normalizeRole(role: string | null | undefined): CollaboratorRole {
  return role === "viewer" || role === "editor" || role === "owner" ? role : "viewer";
}

export async function getTripAccess(userId: string, tripId: string): Promise<TripAccess | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      userId: true,
      collaborators: {
        where: { userId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!trip) {
    return null;
  }

  if (trip.userId === userId) {
    return {
      tripId: trip.id,
      userId,
      role: "owner",
      isOwner: true,
    };
  }

  const collaborator = trip.collaborators[0];
  if (!collaborator) {
    return null;
  }

  return {
    tripId: trip.id,
    userId,
    role: normalizeRole(collaborator.role),
    isOwner: false,
  };
}

export async function requireTripAccess(
  userId: string,
  tripId: string,
  permission: "view" | "edit" | "invite" | "delete" | "managePermissions",
): Promise<TripAccess> {
  const access = await getTripAccess(userId, tripId);
  if (!access) {
    const exists = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    });
    throw new Error(exists ? "forbidden" : "not_found");
  }
  if (!canCollaborator(access.role, permission)) {
    throw new Error("forbidden");
  }
  return access;
}

export async function assertFolderOwner(userId: string, folderId: string) {
  const folder = await prisma.itineraryFolder.findUnique({
    where: { id: folderId },
    select: { userId: true },
  });
  if (!folder) {
    throw new Error("not_found");
  }
  if (folder.userId !== userId) {
    throw new Error("forbidden");
  }
}

