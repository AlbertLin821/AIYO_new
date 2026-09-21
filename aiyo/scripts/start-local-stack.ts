import { spawn } from "node:child_process";
import { loadProjectEnvIntoProcess } from "../src/lib/projectEnv";
loadProjectEnvIntoProcess(process.cwd(), { override: false });
for (const key of ["DATABASE_URL", "REDIS_URL", "MEM0_BASE_URL", "OPENWEBUI_BASE_URL", "OLLAMA_BASE_URL", "OLLAMA_DIRECT_BASE_URL"]) {
  const value = process.env[key];
  if (!value) continue;
  try {
    const url = new URL(value);
    if (["aiyo-new-postgres", "aiyo-new-redis", "aiyo-new-mem0", "open-webui", "host.docker.internal"].includes(url.hostname)) url.hostname = "127.0.0.1";
    if (key === "OPENWEBUI_BASE_URL" && url.hostname === "127.0.0.1" && url.port === "8080") url.port = process.env.OPENWEBUI_HOST_PORT || "18080";
    process.env[key] = url.toString().replace(/\/$/, "");
  } catch { /* non-url config is validated by provider */ }
}
const mode = process.argv[2] || "app";
const port = process.env.PORT || "3000";
process.env.NEXTAUTH_URL = `http://127.0.0.1:${port}`;
const args = mode === "worker" ? ["--import", "tsx", "scripts/video-worker.ts"]
  : mode === "migrate" ? ["node_modules/prisma/build/index.js", "migrate", "deploy"]
  : mode === "production" ? ["node_modules/next/dist/bin/next", "start", "--port", port]
  : ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", port];
const child = spawn(process.execPath, args, { stdio: "inherit", env: { ...process.env, ...(mode === "production" ? { NODE_ENV: "production" } : {}) }, windowsHide: true });
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
