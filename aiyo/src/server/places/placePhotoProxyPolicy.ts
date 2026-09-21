export const PLACE_PHOTO_MAX_WIDTH = 1600;
export const PLACE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PLACE_PHOTO_TIMEOUT_MS = 10_000;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function parsePlacePhotoWidth(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return 480;
  if (!/^\d+$/u.test(raw)) return null;
  const width = Number(raw);
  return Number.isSafeInteger(width) && width >= 1 && width <= PLACE_PHOTO_MAX_WIDTH
    ? width
    : null;
}

export function isAllowedPlacePhotoContentType(value: string | null): boolean {
  return ALLOWED_IMAGE_TYPES.has((value || "").split(";", 1)[0].trim().toLowerCase());
}

export function placePhotoRequestIdentity(request: Request): string {
  // x-real-ip is expected to be overwritten by the trusted deployment proxy.
  // When unavailable, use one shared anonymous bucket instead of trusting an
  // attacker-controlled forwarded chain.
  return request.headers.get("x-real-ip")?.trim() || "anonymous";
}
