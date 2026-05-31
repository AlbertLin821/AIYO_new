export type GeocodeProvider = "google-places" | "google-geocoding" | "manual" | "none";

export type GeocodeStatus =
  | "idle"
  | "pending"
  | "resolved"
  | "not_found"
  | "ambiguous"
  | "failed";

export type GeocodedPlace = {
  placeName: string;
  formattedAddress?: string | null;
  placeId?: string | null;
  lat: number;
  lng: number;
  provider: GeocodeProvider;
  confidence?: number;
  sourceQuery?: string;
  countryCode?: string | null;
};

export type PendingGeocodeTarget = {
  tripId?: string;
  dayId: string;
  itemId?: string;
  query: string;
  destinationHint?: string | null;
  countryHint?: string | null;
  reason: "assistant_action_add" | "assistant_action_update" | "manual_add" | "map_focus";
};

export type GeocodePurpose = "itinerary_item" | "map_focus";

export type GeocodeApiErrorCode =
  | "missing_api_key"
  | "not_found"
  | "ambiguous"
  | "provider_error"
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found_trip";

export type PlacesGeocodeRequest = {
  query: string;
  destinationHint?: string;
  countryHint?: string;
  tripId?: string;
  dayId?: string;
  itemId?: string;
  purpose: GeocodePurpose;
};

export type PlacesGeocodeSuccess = {
  success: true;
  place: GeocodedPlace;
};

export type PlacesGeocodeFailure = {
  success: false;
  error: {
    code: GeocodeApiErrorCode;
    message: string;
  };
};

export type PlacesGeocodeResponse = PlacesGeocodeSuccess | PlacesGeocodeFailure;
