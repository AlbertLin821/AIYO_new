import { loadProjectEnvIntoProcess } from "../../../src/lib/projectEnv";

process.env.AIYO_ENV_FILE ||= ".env.dev";
process.env.AIYO_ENV_MODE ||= "dev";
process.env.DATABASE_URL ||=
  process.env.PLAYWRIGHT_DATABASE_URL ||
  "postgresql://aiyo:aiyo_password_change_me@127.0.0.1:5432/aiyo_new_db?schema=public";
process.env.REDIS_URL ||= process.env.PLAYWRIGHT_REDIS_URL || "redis://127.0.0.1:6379/0";
process.env.NEXTAUTH_SECRET ||= "replace-with-dev-nextauth-secret";

loadProjectEnvIntoProcess(process.cwd(), { override: false });

