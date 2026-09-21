import type { MapPoiCategory } from "@/server/maps/types";

export const POI_CATEGORY_MAP: Record<MapPoiCategory, ReadonlyArray<readonly [string, string]>> = {
  restaurant: [["amenity", "restaurant"]],
  cafe: [["amenity", "cafe"]],
  hotel: [["tourism", "hotel"], ["tourism", "hostel"], ["tourism", "guest_house"]],
  attraction: [["tourism", "attraction"]],
  museum: [["tourism", "museum"]],
  park: [["leisure", "park"], ["leisure", "garden"]],
  convenience: [["shop", "convenience"]],
  parking: [["amenity", "parking"]],
  station: [["railway", "station"], ["public_transport", "station"]],
};

export function isMapPoiCategory(value: string): value is MapPoiCategory {
  return Object.hasOwn(POI_CATEGORY_MAP, value);
}

export function buildNearbyOverpassQuery(category: MapPoiCategory, lat: number, lng: number, radius: number): string {
  const selectors = POI_CATEGORY_MAP[category]
    .flatMap(([key, value]) => ["node", "way", "relation"].map((kind) => `${kind}(around:${radius},${lat},${lng})["${key}"="${value}"];`))
    .join("");
  return `[out:json][timeout:10];(${selectors});out center tags;`;
}

