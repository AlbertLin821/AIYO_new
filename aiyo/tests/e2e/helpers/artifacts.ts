import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const ROOT = path.join(process.cwd(), "tmp", "e2e-artifacts");

export function artifactRoot(): string {
  return ROOT;
}

export function ensureArtifactDirs(): void {
  for (const segment of ["screenshots", "network", "json", "traces"]) {
    mkdirSync(path.join(ROOT, segment), { recursive: true });
  }
}

export function writeArtifactJson(filename: string, data: unknown): string {
  ensureArtifactDirs();
  const fp = path.join(ROOT, "json", filename);
  writeFileSync(fp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return fp;
}

export function writeArtifactNetwork(filename: string, data: unknown): string {
  ensureArtifactDirs();
  const fp = path.join(ROOT, "network", filename);
  writeFileSync(fp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  return fp;
}
