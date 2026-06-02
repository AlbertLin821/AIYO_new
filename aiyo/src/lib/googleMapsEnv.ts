import fs from "node:fs";
import path from "node:path";

import { normalizeGoogleMapsMapId } from "./googleMapsMapId";

export { normalizeGoogleMapsMapId } from "./googleMapsMapId";

const AIYO_ROOT = path.join(__dirname, "..", "..");

/** Parse KEY=VALUE lines from .env files (no variable expansion). */
export function parseDotenvContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** .env then .env.local (local wins), same order as Next.js. */
export function loadMapsKeysFromProjectFiles(
  projectRoot: string = AIYO_ROOT,
): { server: string; client: string } {
  const merged: Record<string, string> = {};
  for (const name of [".env", ".env.local"] as const) {
    const filePath = path.join(projectRoot, name);
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }
      Object.assign(merged, parseDotenvContent(fs.readFileSync(filePath, "utf8")));
    } catch {
      // ignore unreadable env files
    }
  }
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
  const processServer = env.GOOGLE_MAPS_API_KEY?.trim() || "";
  const processClient = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || "";
  if (fromFiles.server && processServer && fromFiles.server !== processServer) {
    console.warn(
      "[google-maps-env] GOOGLE_MAPS_API_KEY in process env differs from aiyo/.env files; using .env/.env.local. In Docker, run compose with --force-recreate app-dev so image ENV does not keep a deleted-project key.",
    );
  }
  if (fromFiles.client && processClient && fromFiles.client !== processClient) {
    console.warn(
      "[google-maps-env] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in process env differs from aiyo/.env files; using .env/.env.local.",
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
    const merged: Record<string, string> = {};
    for (const name of [".env", ".env.local"] as const) {
      const filePath = path.join(AIYO_ROOT, name);
      try {
        if (!fs.existsSync(filePath)) {
          continue;
        }
        Object.assign(merged, parseDotenvContent(fs.readFileSync(filePath, "utf8")));
      } catch {
        // ignore
      }
    }
    if (merged.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim()) {
      mapId = merged.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID.trim();
    }
  }

  return normalizeGoogleMapsMapId(mapId);
}
