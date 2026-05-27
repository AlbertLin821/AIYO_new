import { execSync } from "node:child_process";

export default async function globalSetup() {
  try {
    execSync("npx prisma migrate deploy", {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    execSync("npx prisma generate", {
      cwd: process.cwd(),
      stdio: "pipe",
      env: process.env,
    });
  } catch (error) {
    console.warn(
      "[e2e global-setup] Skipped prisma migrate/generate (database or prisma unavailable).",
      error instanceof Error ? error.message : error,
    );
  }
}
