import { mapService } from "@/server/maps/service";
import { resolveTripDestinationScope } from "@/lib/tripDestinationScope";
const CATEGORY_TYPES: Record<string, string> = {
  convenience: "convenience_store", station: "train_station", attraction: "tourist_attraction",
};
export type PlaceSearchHit = {
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string;
  source?: "photon" | "overpass";
  checkedAt?: string;
  types: string[];
  countryCode?: string;
  openingHours?: string;
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;
  photoUrl?: string;
  rating?: number;
  userRatingsTotal?: number;
};
export async function searchPlacesByText(
  query: string,
  locationHint?: string,
  options?: { maxResults?: number },
): Promise<
  { ok: true; places: PlaceSearchHit[] } | { ok: false; reason: string }
> {
  try {
    // Photon indexes place names and addresses; a conversational compound query
    // frequently returns no hits. Resolve the actual place name first.
    const rows = await mapService.searchPlaces(query.trim(),
      { limit: options?.maxResults, language: "zh" },
    ).catch(() => []);
    const normalize = (value: string) => value.toLocaleLowerCase().replace(/[\s·・,，、]/gu, "");
    const exactFound = rows.some((poi) => normalize(poi.name) === normalize(query));
    const countryCode = resolveTripDestinationScope(locationHint)?.countryCodes[0];
    const regional = countryCode === "TW" || countryCode === "JP" || countryCode === "KR" ? countryCode : null;
    const exact = !exactFound && regional ? await mapService.searchExactNamedPlace(query, regional) : [];
    const combined = [...exact.map((poi) => ({ ...poi, metadata: { ...poi.metadata, countryCode: regional! } })), ...rows].slice(0, options?.maxResults ?? 8);
    return {
      ok: true,
      places: combined.map((poi) => ({
        name: poi.name,
        formattedAddress: poi.address || "",
        lat: poi.location.lat,
        lng: poi.location.lng,
        placeId: poi.externalId || poi.id,
        source: poi.source === "overpass" ? "overpass" : "photon",
        checkedAt: poi.checkedAt,
        // Use only categories supplied by the map provider, never infer from a query.
        types: poi.category ? [CATEGORY_TYPES[poi.category] || poi.category] : [],
        countryCode: poi.metadata?.countryCode,
        openingHours: poi.metadata?.openingHours,
        phoneNumber: poi.metadata?.phone,
        website: poi.metadata?.website,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Map search failed",
    };
  }
}
