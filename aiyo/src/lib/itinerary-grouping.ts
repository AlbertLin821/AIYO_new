import type { ItineraryListItem } from "@/lib/itinerary-sort";
import type { ItineraryFolderDto } from "@/services/itineraryClient";

export type ItineraryFolderGroup = {
  folder: ItineraryFolderDto;
  trips: ItineraryListItem[];
};

export type LandingItineraryGroups = {
  unfiled: ItineraryListItem[];
  folderGroups: ItineraryFolderGroup[];
};

export function groupItinerariesForLanding(
  trips: ItineraryListItem[],
  folders: ItineraryFolderDto[],
): LandingItineraryGroups {
  const folderIds = new Set(folders.map((folder) => folder.id));
  const byFolderId = new Map<string, ItineraryListItem[]>();
  const unfiled: ItineraryListItem[] = [];

  for (const trip of trips) {
    const folderId = trip.folderId ?? null;
    if (!folderId || !folderIds.has(folderId)) {
      unfiled.push(trip);
      continue;
    }
    const bucket = byFolderId.get(folderId);
    if (bucket) {
      bucket.push(trip);
    } else {
      byFolderId.set(folderId, [trip]);
    }
  }

  const sortedFolders = [...folders].sort((left, right) => left.sortOrder - right.sortOrder);
  const folderGroups: ItineraryFolderGroup[] = [];

  for (const folder of sortedFolders) {
    const folderTrips = byFolderId.get(folder.id);
    if (!folderTrips?.length) {
      continue;
    }
    folderGroups.push({ folder, trips: folderTrips });
  }

  return { unfiled, folderGroups };
}

export const LANDING_DROP_UNFILED = "drop:unfiled";

export function landingDropFolderId(folderId: string) {
  return `drop:folder:${folderId}`;
}

export function parseLandingDropId(dropId: string | null | undefined): string | null {
  if (!dropId || dropId === LANDING_DROP_UNFILED) {
    return null;
  }
  if (dropId.startsWith("drop:folder:")) {
    return dropId.slice("drop:folder:".length);
  }
  return null;
}
