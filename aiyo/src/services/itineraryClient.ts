import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/services/apiClient";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import type { CollaboratorRole } from "@/lib/permissions";
import type { ChatMessage, CollaborationPresenceState, PersistedTripPayload } from "@/types";

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
  chatMessages: ChatMessage[];
  collaboration: CollaborationPresenceState | null;
};

export type AgentPreviewDto = {
  previewId: string;
  expiresAt: string;
  baseRevision: number;
  summary: string;
  operations: Array<{ type: string }>;
  changes: Array<{ type: string; itemId: string; before?: { title: string; time: string; dayNumber?: number }; after?: { title: string; time: string; dayNumber?: number } }>;
  warnings: string[];
  ui?: unknown;
};

export function createAgentPreview(tripId: string, input: { instruction: string; baseRevision: number; selectedEntityIds?: string[] }) {
  return apiPost<typeof input, AgentPreviewDto>(`/api/trips/${tripId}/agent/preview`, input);
}

export function getLatestAgentPreview(tripId: string) {
  return apiGet<{ preview: AgentPreviewDto | null }>(`/api/trips/${tripId}/agent/preview/latest`);
}

export function adjustAgentPreviewTime(tripId: string, previewId: string, operationIndex: number, time: string) {
  return apiPost<{ operationIndex: number; time: string }, AgentPreviewDto>(
    `/api/trips/${tripId}/agent/preview/${previewId}/time`, { operationIndex, time },
  );
}

export function adjustAgentPreviewPlace(tripId: string, previewId: string, operationIndex: number, query: string) {
  return apiPost<{ operationIndex: number; query: string }, AgentPreviewDto>(
    `/api/trips/${tripId}/agent/preview/${previewId}/place`, { operationIndex, query },
  );
}

export function cancelAgentPreview(tripId: string, previewId: string) {
  return apiDelete<{ ok: boolean }>(`/api/trips/${tripId}/agent/preview/${previewId}`);
}

export function applyAgentPreview(tripId: string, previewId: string, baseRevision: number, idempotencyKey: string) {
  return apiPost<{ previewId: string; baseRevision: number; idempotencyKey: string }, { trip: PersistedTripPayload; revision: number; mutationId: string }>(
    `/api/trips/${tripId}/agent/apply`, { previewId, baseRevision, idempotencyKey },
  );
}

export function undoAgentMutation(tripId: string, mutationId: string, baseRevision: number, idempotencyKey: string) {
  return apiPost<{ action: "undo"; mutationId: string; baseRevision: number; idempotencyKey: string }, { trip: PersistedTripPayload; revision: number; mutationId: string }>(
    `/api/trips/${tripId}/mutations/execute`, { action: "undo", mutationId, baseRevision, idempotencyKey },
  );
}

export function redoAgentMutation(tripId: string, mutationId: string, baseRevision: number, idempotencyKey: string) {
  return apiPost<{ action: "redo"; mutationId: string; baseRevision: number; idempotencyKey: string }, { trip: PersistedTripPayload; revision: number; mutationId: string }>(
    `/api/trips/${tripId}/mutations/execute`, { action: "redo", mutationId, baseRevision, idempotencyKey },
  );
}

export function getLatestAgentMutation(tripId: string) {
  return apiGet<{ action: { mode: "undo" | "redo"; mutationId: string } | null; revision: number }>(`/api/trips/${tripId}/mutations/agent-latest`);
}

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

export function getLatestAiMutation(tripId: string) {
  return apiGet<{ mutation: { id: string; resultRevision: number; createdAt: string } | null; revision: number }>(
    `/api/trips/${tripId}/mutations/latest`,
  );
}

export function undoAiMutation(tripId: string, mutationId: string) {
  return apiPost<Record<string, never>, { trip: PersistedTripPayload; revision: number }>(
    `/api/trips/${tripId}/mutations/${mutationId}/undo`,
    {},
  );
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
  input: { title?: string; coverImageUrl?: string | null; startDate?: string | null; revision: number },
) {
  return apiPatch<typeof input, { id: string; title: string; coverImageUrl: string | null; startDate: string | null; revision: number }>(
    `/api/trips/${tripId}`,
    input,
  );
}

export function updateTripTitle(tripId: string, title: string, revision: number) {
  return patchTripDetails(tripId, { title, revision });
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

