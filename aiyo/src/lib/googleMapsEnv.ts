import path from "node:path";

import { normalizeGoogleMapsMapId } from "./googleMapsMapId";
import { describeProjectEnvSource, readProjectEnvFile } from "./projectEnv";

export { normalizeGoogleMapsMapId } from "./googleMapsMapId";

const AIYO_ROOT = path.join(__dirname, "..", "..");

/** Reads the active project env file so Docker and local scripts share one source of truth. */
export function loadMapsKeysFromProjectFiles(
  projectRoot: string = AIYO_ROOT,
): { server: string; client: string } {
  const merged = readProjectEnvFile(projectRoot);
  return {
    server: merged.GOOGLE_MAPS_API_KEY?.trim() ?? "",
    client: merged.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "",
  };
}

function warnIfProcessEnvOverridesFiles(
  env: NodeJS.ProcessEnv,
  fromFiles: { server: string; client: string },
): void {
  if (env.NODE_ENV === "production") {
    return;
  }
  const envSource = `aiyo/${describeProjectEnvSource(AIYO_ROOT, env)}`;
  const processServer = env.GOOGLE_MAPS_API_KEY?.trim() || "";
  const processClient = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || "";
  if (fromFiles.server && processServer && fromFiles.server !== processServer) {
    console.warn(
      `[google-maps-env] GOOGLE_MAPS_API_KEY in process env differs from ${envSource}; using ${envSource}. In Docker, recreate the matching app service so the container does not keep a deleted-project key.`,
    );
  }
  if (fromFiles.client && processClient && fromFiles.client !== processClient) {
    console.warn(
      `[google-maps-env] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in process env differs from ${envSource}; using ${envSource}.`,
    );
  }
}

function resolveMapsKeys(env: NodeJS.ProcessEnv = process.env): { server: string; client: string } {
  let server = env.GOOGLE_MAPS_API_KEY?.trim() || "";
  let client = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || "";

  const shouldPreferProjectFiles =
    typeof window === "undefined" && env === process.env;

  if (shouldPreferProjectFiles) {
    const fromFiles = loadMapsKeysFromProjectFiles();
    warnIfProcessEnvOverridesFiles(env, fromFiles);
    if (fromFiles.server) {
      server = fromFiles.server;
    }
    if (fromFiles.client) {
      client = fromFiles.client;
    }
  }

  return { server, client };
}

/**
 * Server-side Google Maps key. Use this for Geocoding, Places, Static Maps and Routes API.
 */
export function resolveGoogleMapsApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { server, client } = resolveMapsKeys(env);
  return server || client;
}

/**
 * Browser-safe Google Maps key. Use this only for Maps JavaScript API.
 */
export function resolveGoogleMapsClientApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { server, client } = resolveMapsKeys(env);
  return client || server;
}

export function resolveGoogleMapsMapId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  let mapId = env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || "";

  const shouldPreferProjectFiles =
    typeof window === "undefined" && env === process.env;

  if (shouldPreferProjectFiles) {
    const merged = readProjectEnvFile(AIYO_ROOT);
    if (merged.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim()) {
      mapId = merged.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID.trim();
    }
  }

  return normalizeGoogleMapsMapId(mapId);
}
