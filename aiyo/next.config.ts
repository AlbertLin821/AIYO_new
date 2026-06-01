import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

import { resolveGoogleMapsApiKey, resolveGoogleMapsMapId } from "./src/lib/googleMapsEnv";

const repoRoot = path.join(__dirname);
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production");

const mapsKey = resolveGoogleMapsApiKey();
const mapId = resolveGoogleMapsMapId();
const enableMockMaps =
  (process.env.NEXT_PUBLIC_ENABLE_MOCK_MAPS ||
    process.env.ENABLE_MOCK_MAPS ||
    ""
  ).trim();

const injectedEnv: Record<string, string> = {};
if (mapsKey) {
  injectedEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = mapsKey;
}
if (mapId) {
  injectedEnv.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID = mapId;
}
if (enableMockMaps) {
  injectedEnv.NEXT_PUBLIC_ENABLE_MOCK_MAPS = enableMockMaps;
}

const nextConfig: NextConfig = {
  // Enable after removing route-level `export const dynamic = "force-dynamic"` conflicts.
  // cacheComponents: true,
  reactCompiler: {
    compilationMode: "annotation",
  },
  env: injectedEnv,
  async redirects() {
    return [
      {
        source: "/collaborate",
        destination: "/itinerary",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
