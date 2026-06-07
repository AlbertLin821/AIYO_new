import { spawn } from "node:child_process";

import { loadProjectEnvIntoProcess } from "@/lib/projectEnv";

loadProjectEnvIntoProcess(process.cwd(), { override: false });

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: tsx scripts/run-with-project-env.ts <command> [...args]");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
