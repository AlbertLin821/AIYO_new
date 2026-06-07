import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.PLAYWRIGHT_PORT || "3000";
const e2eBaseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${e2ePort}`;
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
  },
  webServer: {
    command: e2eWebServerCommand,
    url: e2eBaseURL,
    reuseExistingServer: process.env.CI ? false : true,
    timeout: 60_000,
    env: {
      ...process.env,
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
