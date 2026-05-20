import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/services/apiClient";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import type { CollaboratorRole } from "@/lib/permissions";
import type { CollaborationPresenceState, PersistedTripPayload } from "@/types";

export type ItineraryFolderDto = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TripCollaboratorDto = {
  id: string;
  tripId: string;
  userId: string;
  role: CollaboratorRole;
  user: {
    name: string | null;
    email: string;
    image?: string | null;
  };
};

export type TripSwitchPayload = {
  trip: PersistedTripPayload;
  collaboration: CollaborationPresenceState | null;
};

export function listItineraryFolders() {
  return apiGet<ItineraryFolderDto[]>("/api/itinerary-folders");
}

export function listTripsForLibrary(scope: "recent" | "mine" | "shared") {
  const query =
    scope === "mine" ? "?scope=mine" : scope === "shared" ? "?scope=shared" : "?scope=recent";
  return apiGet<ItineraryListItem[]>(`/api/trips${query}`);
}

export function setActiveTrip(tripId: string) {
  return apiPost<{ tripId: string }, TripSwitchPayload>("/api/trips/active", { tripId });
}

export function createItineraryFolder(input: { name: string; sortOrder?: number }) {
  return apiPost<typeof input, ItineraryFolderDto>("/api/itinerary-folders", input);
}

export function updateItineraryFolder(id: string, input: { name?: string; sortOrder?: number }) {
  return apiPatch<typeof input, ItineraryFolderDto>(`/api/itinerary-folders/${id}`, input);
}

export function deleteItineraryFolder(id: string) {
  return apiDelete<{ ok: boolean }>(`/api/itinerary-folders/${id}`);
}

export function moveTripToFolder(tripId: string, folderId: string | null) {
  return apiPatch<{ folderId: string | null }, { id: string; folderId: string | null }>(
    `/api/trips/${tripId}/folder`,
    { folderId },
  );
}

export function listTripCollaborators(tripId: string) {
  return apiGet<TripCollaboratorDto[]>(`/api/trips/${tripId}/collaborators`);
}

export function addTripCollaborator(
  tripId: string,
  input: { email: string; role: Exclude<CollaboratorRole, "owner"> },
) {
  return apiPost<typeof input, TripCollaboratorDto>(`/api/trips/${tripId}/collaborators`, input);
}

export function updateTripCollaboratorRole(
  tripId: string,
  userId: string,
  role: Exclude<CollaboratorRole, "owner">,
) {
  return apiPatch<{ role: Exclude<CollaboratorRole, "owner"> }, TripCollaboratorDto>(
    `/api/trips/${tripId}/collaborators/${userId}`,
    { role },
  );
}

export function removeTripCollaborator(tripId: string, userId: string) {
  return apiDelete<{ ok: boolean }>(`/api/trips/${tripId}/collaborators/${userId}`);
}

export function deleteTrip(tripId: string) {
  return apiDelete<{ ok: boolean }>(`/api/trips/${tripId}`);
}

export function duplicateTrip(tripId: string) {
  return apiPost<Record<string, never>, { tripId: string }>(`/api/trips/${tripId}/duplicate`, {});
}

export function patchTripDetails(
  tripId: string,
  input: { title?: string; coverImageUrl?: string | null },
) {
  return apiPatch<typeof input, { id: string; title: string; coverImageUrl: string | null }>(
    `/api/trips/${tripId}`,
    input,
  );
}

export function updateTripTitle(tripId: string, title: string) {
  return patchTripDetails(tripId, { title });
}

export type JoinCollabResult = {
  tripId: string;
  tripName: string;
  role: string;
  members: number;
};

export function joinCollabTrip(inviteCode: string) {
  return apiPost<{ inviteCode: string }, JoinCollabResult>("/api/collab/join", { inviteCode });
}

export function createNewTrip(input?: {
  title?: string;
  destination?: string;
  days?: number;
  coverImageUrl?: string | null;
}) {
  const payload: PersistedTripPayload = {
    tripId: "",
    title: input?.title?.trim() || "",
    destination: input?.destination?.trim() || "",
    days: Math.max(0, Math.floor(input?.days ?? 0)),
    budget: 0,
    coverImageUrl: input?.coverImageUrl ?? null,
    itinerary: [],
    pins: [],
    updatedAt: new Date().toISOString(),
  };
  return apiPut<PersistedTripPayload, PersistedTripPayload>("/api/trips/current", payload);
}

