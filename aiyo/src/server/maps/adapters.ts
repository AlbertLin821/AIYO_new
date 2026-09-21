import type { MapPoi } from "@/server/maps/types";
import type { GeocodedPlace, PlaceSuggestion } from "@/types/geocode";

export function mapPoiToGeocodedPlace(poi: MapPoi, query: string): GeocodedPlace {
  return { placeName: poi.name, formattedAddress: poi.address, placeId: poi.externalId || poi.id, lat: poi.location.lat, lng: poi.location.lng, provider: poi.source === "overpass" ? "overpass" : "photon", confidence: 0.86, sourceQuery: query };
}

export function mapPoiToSuggestion(poi: MapPoi, query: string): PlaceSuggestion {
  return { ...mapPoiToGeocodedPlace(poi, query), openingHours: poi.metadata?.openingHours, phoneNumber: poi.metadata?.phone, website: poi.metadata?.website };
}
