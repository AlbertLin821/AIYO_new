import fs from "node:fs";
import path from "node:path";

export const PROJECT_ENV_FILE = ".env";
export const PROJECT_ENV_DEV_FILE = ".env.dev";
export const PROJECT_ENV_PROD_LIVE_FILE = ".env.prod-live";
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

export function getPreferredProjectEnvFileName(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.AIYO_ENV_FILE?.trim();
  if (explicit) {
    return explicit;
  }

  const mode = env.AIYO_ENV_MODE?.trim().toLowerCase();
  if (mode === "prod-live") {
    return PROJECT_ENV_PROD_LIVE_FILE;
  }
  if (mode === "dev") {
    return PROJECT_ENV_DEV_FILE;
  }

  return env.NODE_ENV === "production"
    ? PROJECT_ENV_PROD_LIVE_FILE
    : PROJECT_ENV_DEV_FILE;
}

export function listProjectEnvCandidates(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const candidates = [
    getPreferredProjectEnvFileName(env),
    PROJECT_ENV_LOCAL_FILE,
    PROJECT_ENV_FILE,
  ];
  return candidates.filter(
    (candidate, index) => candidate && candidates.indexOf(candidate) === index,
  );
}

function resolveProjectEnvPath(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const candidate of listProjectEnvCandidates(env)) {
    const filePath = path.isAbsolute(candidate)
      ? candidate
      : path.join(projectRoot, candidate);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

export function describeProjectEnvSource(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const filePath = resolveProjectEnvPath(projectRoot, env);
  return filePath ? path.basename(filePath) : getPreferredProjectEnvFileName(env);
}

export function readProjectEnvFile(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const filePath = resolveProjectEnvPath(projectRoot, env);
  try {
    if (!filePath) {
      return {};
    }
    return parseDotenvContent(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

export function loadProjectEnvIntoProcess(
  projectRoot: string,
  options?: { override?: boolean; env?: NodeJS.ProcessEnv },
): Record<string, string> {
  const env = options?.env ?? process.env;
  const parsed = readProjectEnvFile(projectRoot, env);
  const override = options?.override === true;
  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return parsed;
}

export function readProjectEnvLocal(projectRoot: string): Record<string, string> {
  return readProjectEnvFile(projectRoot);
}

export function loadProjectEnvLocalIntoProcess(
  projectRoot: string,
  options?: { override?: boolean; env?: NodeJS.ProcessEnv },
): Record<string, string> {
  return loadProjectEnvIntoProcess(projectRoot, options);
}
