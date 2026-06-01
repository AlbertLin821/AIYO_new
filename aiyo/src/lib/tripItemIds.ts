/** Stable unique id for client-created itinerary items (map POI add, manual geocode, etc.). */
export function createTripItemId(prefix = "item"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
