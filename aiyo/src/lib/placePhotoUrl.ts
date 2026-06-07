export const PLACE_PHOTO_PROXY_PATH = "/api/map/place-photo";

const PHOTO_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{10,2048}$/;

export function isValidPhotoReference(ref: string): boolean {
  return PHOTO_REFERENCE_PATTERN.test(ref.trim());
}

export function buildPlacePhotoProxyUrl(photoReference: string, maxwidth = 480): string {
  const safeWidth = Math.min(1600, Math.max(1, Math.floor(maxwidth)));
  const params = new URLSearchParams({
    ref: photoReference.trim(),
    maxwidth: String(safeWidth),
  });
  return `${PLACE_PHOTO_PROXY_PATH}?${params.toString()}`;
}

export function isPlacePhotoProxyUrl(url?: string | null): boolean {
  return Boolean(url?.trim().startsWith(PLACE_PHOTO_PROXY_PATH));
}

export function hasUsablePlacePhotoUrl(url?: string | null, placeId?: string | null): boolean {
  const resolved = resolvePlacePhotoUrl(url, placeId);
  if (!resolved) {
    return false;
  }
  if (!isPlacePhotoProxyUrl(resolved)) {
    return true;
  }
  const query = resolved.split("?", 2)[1] ?? "";
  const params = new URLSearchParams(query);
  return Boolean(params.get("placeId")?.trim());
}

function withPlaceId(url: string, placeId?: string | null): string {
  const trimmedPlaceId = placeId?.trim();
  if (!trimmedPlaceId) {
    return url;
  }
  const [pathname, search = ""] = url.split("?", 2);
  const params = new URLSearchParams(search);
  params.set("placeId", trimmedPlaceId);
  return `${pathname}?${params.toString()}`;
}

function extractPhotoReferenceFromGoogleUrl(url: URL): string | null {
  if (!url.pathname.includes("/place/photo")) {
    return null;
  }
  const ref = url.searchParams.get("photo_reference") ?? url.searchParams.get("ref");
  if (!ref || !isValidPhotoReference(ref)) {
    return null;
  }
  return ref;
}

export function resolvePlacePhotoUrl(url?: string | null, placeId?: string | null): string | undefined {
  if (!url?.trim()) {
    return undefined;
  }

  const trimmed = url.trim();
  if (trimmed.startsWith(PLACE_PHOTO_PROXY_PATH)) {
    return withPlaceId(trimmed, placeId);
  }

  try {
    const parsed = trimmed.startsWith("http")
      ? new URL(trimmed)
      : new URL(trimmed, "https://local.invalid");
    const ref = extractPhotoReferenceFromGoogleUrl(parsed);
    if (ref) {
      const maxwidth = Number(parsed.searchParams.get("maxwidth")) || 480;
      return withPlaceId(buildPlacePhotoProxyUrl(ref, maxwidth), placeId);
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
    if (parsed.origin === "https://local.invalid" && trimmed.startsWith("/")) {
      return trimmed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
