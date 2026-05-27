import { apiDelete, apiGet, apiPost } from "@/services/apiClient";
import type {
  PublicItineraryDetail,
  PublicItinerarySummary,
  TripPublicationStatus,
} from "@/types";

export async function listPublicItineraries(input?: {
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ items: PublicItinerarySummary[]; nextCursor?: string }> {
  const params = new URLSearchParams();
  if (input?.q?.trim()) {
    params.set("q", input.q.trim());
  }
  if (input?.limit) {
    params.set("limit", String(input.limit));
  }
  if (input?.cursor) {
    params.set("cursor", input.cursor);
  }
  const query = params.toString();
  return apiGet<{ items: PublicItinerarySummary[]; nextCursor?: string }>(
    `/api/trips/public${query ? `?${query}` : ""}`,
  );
}

export async function getPublicItineraryDetail(publicationId: string): Promise<PublicItineraryDetail> {
  return apiGet<PublicItineraryDetail>(`/api/trips/public/${encodeURIComponent(publicationId)}`);
}

export async function copyPublicItinerary(publicationId: string): Promise<{ tripId: string }> {
  return apiPost<Record<string, never>, { tripId: string }>(
    `/api/trips/public/${encodeURIComponent(publicationId)}/copy`,
    {},
  );
}

export async function getTripPublicationStatus(tripId: string): Promise<TripPublicationStatus> {
  return apiGet<TripPublicationStatus>(`/api/trips/${encodeURIComponent(tripId)}/publish`);
}

export async function publishTrip(tripId: string): Promise<{ publicationId: string; publishedAt: string }> {
  return apiPost<Record<string, never>, { publicationId: string; publishedAt: string }>(
    `/api/trips/${encodeURIComponent(tripId)}/publish`,
    {},
  );
}

export async function unpublishTrip(tripId: string): Promise<void> {
  await apiDelete(`/api/trips/${encodeURIComponent(tripId)}/publish`);
}
