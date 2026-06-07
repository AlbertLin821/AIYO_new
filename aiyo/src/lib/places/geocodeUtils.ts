import type { GeocodeProvider } from "@/types/geocode";

export function mapGeocodedPlaceResolvedFrom(
  provider: GeocodeProvider,
): "google-geocode" | "google-place-details" {
  return provider === "google-places" ? "google-place-details" : "google-geocode";
}
