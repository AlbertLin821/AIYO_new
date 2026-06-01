import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import type { ApiResponse, GeocodeApiResult, LocationReference } from "@/types";

export type PendingMapPoi = {
  placeId?: string;
  lat: number;
  lng: number;
};

export type PlaceDetailsRow = {
  id?: string;
  name?: string;
  placeId?: string;
  details?: Partial<LocationReference>;
};

export function displayNameFromFormattedAddress(formattedAddress: string): string | undefined {
  const trimmed = formattedAddress.trim();
  if (!trimmed) {
    return undefined;
  }
  const firstSegment = trimmed.split(/[,，]/)[0]?.trim();
  return firstSegment || trimmed;
}

export function displayNameFromCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function resolveLocationDisplayName(input: {
  name?: string;
  formattedAddress?: string;
  lat: number;
  lng: number;
}): string {
  const explicitName = input.name?.trim();
  if (explicitName) {
    return explicitName;
  }
  const fromAddress = input.formattedAddress
    ? displayNameFromFormattedAddress(input.formattedAddress)
    : undefined;
  if (fromAddress) {
    return fromAddress;
  }
  return displayNameFromCoordinates(input.lat, input.lng);
}

export function locationFromGeocodeResult(result: GeocodeApiResult): LocationReference {
  const name = resolveLocationDisplayName({
    name: result.name,
    formattedAddress: result.formattedAddress,
    lat: result.lat,
    lng: result.lng,
  });
  return {
    name,
    lat: result.lat,
    lng: result.lng,
    description: result.formattedAddress,
    address: result.formattedAddress,
    placeId: result.placeId,
    photoUrl: result.photoUrl,
    thumbnail: result.thumbnail ?? result.photoUrl,
    openingHours: result.openingHours,
    phoneNumber: result.phoneNumber,
    website: result.website,
    googleMapsUrl: result.googleMapsUrl,
    rating: result.rating,
    userRatingsTotal: result.userRatingsTotal,
    resolvedFrom: "google-geocode",
    verified: true,
  };
}

export function locationFromPlaceDetailsRow(
  row: PlaceDetailsRow | undefined,
  pendingPoi: PendingMapPoi,
): LocationReference {
  const details = row?.details ?? {};
  const lat = details.lat ?? pendingPoi.lat;
  const lng = details.lng ?? pendingPoi.lng;
  const name = resolveLocationDisplayName({
    name: details.name || row?.name,
    formattedAddress: details.address ?? details.description,
    lat,
    lng,
  });
  return {
    name,
    lat,
    lng,
    description: details.description ?? details.address ?? "",
    address: details.address,
    placeId: pendingPoi.placeId ?? details.placeId,
    photoUrl: details.photoUrl,
    thumbnail: details.thumbnail ?? details.photoUrl,
    openingHours: details.openingHours,
    phoneNumber: details.phoneNumber,
    website: details.website,
    googleMapsUrl: details.googleMapsUrl,
    rating: details.rating,
    userRatingsTotal: details.userRatingsTotal,
    resolvedFrom: "google-place-details",
    verified: details.verified ?? true,
  };
}

export function isCoordinateOnlyName(name: string, lat: number, lng: number): boolean {
  return name === displayNameFromCoordinates(lat, lng);
}

const PLUS_CODE_NAME_PATTERN = /^[A-Z0-9]{4,}\+[A-Z0-9]{2,}$/i;

export function isPlusCodeDisplayName(name: string): boolean {
  return PLUS_CODE_NAME_PATTERN.test(name.trim());
}

/** True when reverse geocode / place details yield a human-readable place, not raw coordinates. */
export function isResolvableMapPickLocation(
  location: Pick<LocationReference, "name" | "lat" | "lng">,
  lat: number,
  lng: number,
): boolean {
  if (!hasUsableMapCoordinate(location)) {
    return false;
  }
  const name = location.name.trim();
  if (name.length < 2) {
    return false;
  }
  if (isCoordinateOnlyName(name, lat, lng)) {
    return false;
  }
  if (isPlusCodeDisplayName(name)) {
    return false;
  }
  return true;
}

async function fetchReverseGeocodeLocation(
  pendingPoi: PendingMapPoi,
  tripDestination: string,
): Promise<LocationReference> {
  const response = await fetch("/api/map/reverse-geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat: pendingPoi.lat,
      lng: pendingPoi.lng,
      region: tripDestination,
    }),
  });
  const payload = (await response.json()) as ApiResponse<{ result: GeocodeApiResult }>;
  if (!payload.success) {
    throw new Error(payload.error.message || "reverse_geocode_failed");
  }
  const location = locationFromGeocodeResult(payload.data.result);
  if (!hasUsableMapCoordinate(location)) {
    throw new Error("invalid_coordinates");
  }
  return location;
}

export async function fetchPendingPoiLocation(
  pendingPoi: PendingMapPoi,
  tripDestination: string,
): Promise<LocationReference> {
  if (pendingPoi.placeId) {
    const response = await fetch("/api/map/place-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: tripDestination,
        places: [
          {
            id: pendingPoi.placeId,
            placeId: pendingPoi.placeId,
            lat: pendingPoi.lat,
            lng: pendingPoi.lng,
          },
        ],
      }),
    });
    const payload = (await response.json()) as ApiResponse<{ results: PlaceDetailsRow[] }>;
    if (!payload.success) {
      throw new Error(payload.error.message);
    }
    let location = locationFromPlaceDetailsRow(payload.data.results[0], pendingPoi);
    if (!hasUsableMapCoordinate(location)) {
      throw new Error("invalid_coordinates");
    }
    if (isCoordinateOnlyName(location.name, pendingPoi.lat, pendingPoi.lng)) {
      try {
        const reverseLocation = await fetchReverseGeocodeLocation(pendingPoi, tripDestination);
        location = {
          ...location,
          name: reverseLocation.name,
          address: reverseLocation.address ?? location.address,
          description: reverseLocation.description ?? location.description,
          placeId: location.placeId ?? reverseLocation.placeId,
        };
      } catch {
        // Keep place-details result when reverse geocode fails.
      }
    }
    return location;
  }

  return fetchReverseGeocodeLocation(pendingPoi, tripDestination);
}
