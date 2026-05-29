import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname);
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production");

const mapsKey =
  (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
const mapId = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "").trim();
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
  // Enable after removing route-level `export const dynamic = "force-dynamic"` conflicts (see docs/PERFORMANCE_BASELINE.md).
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
