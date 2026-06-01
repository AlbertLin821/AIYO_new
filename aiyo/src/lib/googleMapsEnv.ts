/**
 * Single source for Google Maps API key across server, runtime-config, and Next build injection.
 * When GOOGLE_MAPS_API_KEY and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY differ (common with .env + .env.local),
 * prefer GOOGLE_MAPS_API_KEY so the browser does not keep a deleted-project NEXT_PUBLIC key.
 */
export function resolveGoogleMapsApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const server = env.GOOGLE_MAPS_API_KEY?.trim() || "";
  const client = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || "";
  if (server && client && server !== client) {
    if (env.NODE_ENV !== "production") {
      console.warn(
        "[google-maps-env] GOOGLE_MAPS_API_KEY and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY differ; using GOOGLE_MAPS_API_KEY.",
      );
    }
    return server;
  }
  return server || client;
}

/** Reject placeholder Map IDs copied from docs/templates. */
export function normalizeGoogleMapsMapId(value: string): string {
  const raw = value.trim();
  if (!raw || /NEXT_PUBLIC_|GOOGLE_MAPS_API_KEY|Frontend_/i.test(raw)) {
    return "";
  }
  return raw;
}

export function resolveGoogleMapsMapId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return normalizeGoogleMapsMapId(env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || "");
}
