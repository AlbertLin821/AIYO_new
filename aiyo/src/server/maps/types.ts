export type GeoPoint = { lat: number; lng: number };

export type MapPoiSource = "photon" | "overpass" | "user" | "legacy-google";
export type MapPoiCategory =
  | "restaurant"
  | "cafe"
  | "hotel"
  | "attraction"
  | "museum"
  | "park"
  | "convenience"
  | "parking"
  | "station";

export type MapPoi = {
  id: string;
  name: string;
  location: GeoPoint;
  address?: string;
  category?: MapPoiCategory;
  source: MapPoiSource;
  externalId?: string;
  legacyGooglePlaceId?: string;
  metadata?: {
    phone?: string;
    website?: string;
    openingHours?: string;
    cuisine?: string;
    countryCode?: string;
  };
};

export type MapRoute = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

export type MapDistanceMatrix = {
  distancesMeters: Array<Array<number | null>>;
  durationsSeconds: Array<Array<number | null>>;
};

export type SearchPlaceOptions = {
  limit?: number;
  near?: GeoPoint;
  language?: string;
  bbox?: [number, number, number, number];
};

export type NearbyPoiOptions = {
  category: MapPoiCategory;
  radius?: number;
  limit?: number;
};

export type RouteProfile = "driving" | "cycling" | "walking";
