/** Client-safe Map ID helpers (no Node fs). */

/** Reject placeholder Map IDs copied from docs/templates. */
export function normalizeGoogleMapsMapId(value: string): string {
  const raw = value.trim();
  if (!raw || /NEXT_PUBLIC_|GOOGLE_MAPS_API_KEY|Frontend_/i.test(raw)) {
    return "";
  }
  return raw;
}

/** Resolve Map ID from env only — safe for "use client" bundles. */
export function resolveGoogleMapsMapId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return normalizeGoogleMapsMapId(env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || "");
}
