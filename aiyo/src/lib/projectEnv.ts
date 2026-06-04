import fs from "node:fs";
import path from "node:path";

export const PROJECT_ENV_LOCAL_FILE = ".env.local";

/** Parse KEY=VALUE lines from .env-style files (no variable expansion). */
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

export function readProjectEnvLocal(projectRoot: string): Record<string, string> {
  const filePath = path.join(projectRoot, PROJECT_ENV_LOCAL_FILE);
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    return parseDotenvContent(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

export function loadProjectEnvLocalIntoProcess(
  projectRoot: string,
  options?: { override?: boolean },
): Record<string, string> {
  const parsed = readProjectEnvLocal(projectRoot);
  const override = options?.override === true;
  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return parsed;
}
