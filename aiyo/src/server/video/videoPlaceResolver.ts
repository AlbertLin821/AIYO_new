import { geocodeVideoPlaceName } from "@/server/places/geocodeVideoPlace";
import type { GeocodePlaceResult } from "@/server/places/geocodePlace";
import type { TripDestinationScope } from "@/lib/tripDestinationScope";

export type VideoPlaceResolver = (query: string) => Promise<GeocodePlaceResult>;

/** One analysis owns this cache, including failures; scopes never share results. */
export function createVideoPlaceResolver(
  context: { destinationHint?: string; destinationScope?: TripDestinationScope | null },
  geocode: typeof geocodeVideoPlaceName = geocodeVideoPlaceName,
): VideoPlaceResolver {
  const pending = new Map<string, Promise<GeocodePlaceResult>>();
  const queue: Array<() => void> = [];
  let active = 0;
  const drain = () => {
    while (active < 2 && queue.length) {
      active += 1;
      queue.shift()!();
    }
  };
  return (query) => {
    const normalized = query.normalize("NFKC").trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    const existing = pending.get(key);
    if (existing) return existing;
    const result = new Promise<GeocodePlaceResult>((resolve) => {
      queue.push(() => {
        void (async () => {
          try {
            resolve(await geocode({ ...context, query: normalized }));
          } catch {
            resolve({ ok: false, code: "provider_error", message: "地點查詢暫時無法使用。" });
          } finally {
            active -= 1;
            drain();
          }
        })();
      });
    });
    pending.set(key, result);
    drain();
    return result;
  };
}
