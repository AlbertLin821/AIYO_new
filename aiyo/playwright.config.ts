import { defineConfig, devices } from "@playwright/test";
import { loadProjectEnvIntoProcess } from "./src/lib/projectEnv";

process.env.AIYO_ENV_FILE ||= process.env.PLAYWRIGHT_ENV_FILE || ".env.dev";
process.env.AIYO_ENV_MODE ||= "dev";
process.env.AIYO_DEV_BUILD_CONTEXT ||= "host-e2e";
if (process.env.PLAYWRIGHT_HOST_LOCAL_MAPS === "1") {
  const hostMapEndpoints: Record<string, string> = {
    MAP_PHOTON_BASE_URL: "http://127.0.0.1:2322",
    MAP_OVERPASS_TW_URL: "http://127.0.0.1:12345/api/interpreter",
    MAP_OVERPASS_JP_URL: "http://127.0.0.1:12346/api/interpreter",
    MAP_OVERPASS_KR_URL: "http://127.0.0.1:12347/api/interpreter",
    MAP_OSRM_TW_URL: "http://127.0.0.1:5001",
    MAP_OSRM_JP_URL: "http://127.0.0.1:5002",
    MAP_OSRM_KR_URL: "http://127.0.0.1:5003",
    MAP_ALLOW_PUBLIC_FALLBACK: "false",
  };
  for (const [name, endpoint] of Object.entries(hostMapEndpoints)) process.env[name] ||= endpoint;
}
process.env.DATABASE_URL ||=
  process.env.PLAYWRIGHT_DATABASE_URL ||
  "postgresql://aiyo:aiyo_password_change_me@127.0.0.1:5432/aiyo_new_db?schema=public";
process.env.REDIS_URL ||= process.env.PLAYWRIGHT_REDIS_URL || "redis://127.0.0.1:6379/0";
process.env.OPENWEBUI_BASE_URL ||=
  process.env.PLAYWRIGHT_OPENWEBUI_BASE_URL || "http://127.0.0.1:8080";
process.env.NEXTAUTH_SECRET ||=
  process.env.PLAYWRIGHT_NEXTAUTH_SECRET || "replace-with-dev-nextauth-secret";
loadProjectEnvIntoProcess(process.cwd(), { override: false });

const e2ePort = process.env.PLAYWRIGHT_PORT || "3000";
const e2eBaseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${e2ePort}`;
const e2eWebServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || `npm run dev -- --port ${e2ePort}`;
const e2eNextAuthUrl = process.env.PLAYWRIGHT_NEXTAUTH_URL || e2eBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: e2eBaseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: e2eWebServerCommand,
    url: e2eBaseURL,
    reuseExistingServer: process.env.CI ? false : true,
    timeout: 60_000,
    env: {
      ...process.env,
      AIYO_ENV_FILE: process.env.AIYO_ENV_FILE,
      AIYO_ENV_MODE: process.env.AIYO_ENV_MODE,
      NEXTAUTH_URL: e2eNextAuthUrl,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
