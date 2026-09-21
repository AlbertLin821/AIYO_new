import { mapService } from "@/server/maps/service";
const CATEGORY_TYPES: Record<string, string> = {
  convenience: "convenience_store", station: "train_station", attraction: "tourist_attraction",
};
export type PlaceSearchHit = {
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string;
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
    const rows = await mapService.searchPlaces(
      [query, locationHint].filter(Boolean).join(" "),
      { limit: options?.maxResults, language: "zh" },
    );
    return {
      ok: true,
      places: rows.map((poi) => ({
        name: poi.name,
        formattedAddress: poi.address || "",
        lat: poi.location.lat,
        lng: poi.location.lng,
        placeId: poi.externalId || poi.id,
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
