import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadProjectEnvIntoProcess } from "../../src/lib/projectEnv";

process.env.AIYO_ENV_FILE ||= process.env.PLAYWRIGHT_ENV_FILE || ".env.dev";
process.env.AIYO_ENV_MODE ||= "dev";
process.env.DATABASE_URL ||=
  process.env.PLAYWRIGHT_DATABASE_URL ||
  "postgresql://aiyo:aiyo_password_change_me@127.0.0.1:5432/aiyo_new_dev_db?schema=public";
process.env.REDIS_URL ||= process.env.PLAYWRIGHT_REDIS_URL || "redis://127.0.0.1:6379/0";
process.env.OPENWEBUI_BASE_URL ||=
  process.env.PLAYWRIGHT_OPENWEBUI_BASE_URL || "http://127.0.0.1:8080";
process.env.NEXTAUTH_SECRET ||=
  process.env.PLAYWRIGHT_NEXTAUTH_SECRET || "replace-with-dev-nextauth-secret";
loadProjectEnvIntoProcess(process.cwd(), { override: false });

export default async function globalSetup() {
  try {
    execSync("npx prisma migrate deploy", {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    const prismaClientEntry = path.join(
      process.cwd(),
      "node_modules",
      ".prisma",
      "client",
      "index.js",
    );
    const shouldGenerate =
      process.env.PLAYWRIGHT_PRISMA_GENERATE === "1" || !existsSync(prismaClientEntry);
    if (shouldGenerate) {
      execSync("npx prisma generate", {
        cwd: process.cwd(),
        stdio: "pipe",
        env: process.env,
      });
    }
  } catch (error) {
    console.warn(
      "[e2e global-setup] Skipped prisma migrate/generate (database or prisma unavailable).",
      error instanceof Error ? error.message : error,
    );
  }
}
