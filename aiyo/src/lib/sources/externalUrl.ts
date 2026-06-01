import type { SourceReference } from "@/lib/types/sources";

export function buildSourceExternalUrl(source: SourceReference): string | undefined {
  if (source.url?.trim()) {
    return source.url.trim();
  }
  if (source.type === "youtube" && source.youtube?.videoId) {
    const id = source.youtube.videoId;
    const t = source.youtube.startSeconds;
    if (typeof t === "number" && t >= 0) {
      return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&t=${Math.floor(t)}s`;
    }
    return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  }
  const place = source.googlePlace;
  if (source.type === "google_place" && place?.placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${encodeURIComponent(place.placeId)}`;
  }
  if (place?.lat != null && place?.lng != null) {
    return `https://www.google.com/maps?q=${place.lat},${place.lng}`;
  }
  return undefined;
}
