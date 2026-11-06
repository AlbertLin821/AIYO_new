import path from "node:path";
import type { NextConfig } from "next";

import { loadProjectEnvLocalIntoProcess } from "./src/lib/projectEnv";

const repoRoot = path.join(__dirname);
loadProjectEnvLocalIntoProcess(repoRoot, { override: false });

const enableMockMaps =
  (process.env.NEXT_PUBLIC_ENABLE_MOCK_MAPS ||
    process.env.ENABLE_MOCK_MAPS ||
    ""
  ).trim();

const injectedEnv: Record<string, string> = {};
if (enableMockMaps) {
  injectedEnv.NEXT_PUBLIC_ENABLE_MOCK_MAPS = enableMockMaps;
}

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development"
    ? process.env.AIYO_DEV_BUILD_CONTEXT === "host-e2e" ? ".next-dev-host-e2e" : ".next-dev"
    : ".next",
  serverExternalPackages: ["bullmq", "ioredis"],
  // Enable after removing route-level `export const dynamic = "force-dynamic"` conflicts.
  // cacheComponents: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
