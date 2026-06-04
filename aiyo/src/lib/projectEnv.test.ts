import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROJECT_ENV_DEV_FILE,
  PROJECT_ENV_LOCAL_FILE,
  PROJECT_ENV_PROD_LIVE_FILE,
  describeProjectEnvSource,
  getPreferredProjectEnvFileName,
  loadProjectEnvIntoProcess,
  readProjectEnvFile,
} from "./projectEnv";

function makeTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aiyo-project-env-"));
}

test("getPreferredProjectEnvFileName prefers explicit AIYO_ENV_FILE", () => {
  assert.equal(
    getPreferredProjectEnvFileName({
      AIYO_ENV_FILE: ".env.custom",
      NODE_ENV: "production",
    }),
    ".env.custom",
  );
});

test("getPreferredProjectEnvFileName maps production to .env.prod-live", () => {
  assert.equal(
    getPreferredProjectEnvFileName({ NODE_ENV: "production" }),
    PROJECT_ENV_PROD_LIVE_FILE,
  );
});

test("readProjectEnvFile prefers .env.dev before .env.local fallback", () => {
  const root = makeTempProjectRoot();
  try {
    fs.writeFileSync(path.join(root, PROJECT_ENV_LOCAL_FILE), "GOOGLE_MAPS_API_KEY=local\n");
    fs.writeFileSync(path.join(root, PROJECT_ENV_DEV_FILE), "GOOGLE_MAPS_API_KEY=dev\n");

    assert.deepEqual(readProjectEnvFile(root, { NODE_ENV: "development" }), {
      GOOGLE_MAPS_API_KEY: "dev",
    });
    assert.equal(
      describeProjectEnvSource(root, { NODE_ENV: "development" }),
      PROJECT_ENV_DEV_FILE,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loadProjectEnvIntoProcess falls back to .env.local when preferred file is absent", () => {
  const root = makeTempProjectRoot();
  const previous = process.env.TEST_ONLY_ENV_KEY;
  try {
    fs.writeFileSync(path.join(root, PROJECT_ENV_LOCAL_FILE), "TEST_ONLY_ENV_KEY=from-local\n");
    delete process.env.TEST_ONLY_ENV_KEY;

    assert.deepEqual(loadProjectEnvIntoProcess(root, { override: true }), {
      TEST_ONLY_ENV_KEY: "from-local",
    });
    assert.equal(process.env.TEST_ONLY_ENV_KEY, "from-local");
  } finally {
    if (previous === undefined) {
      delete process.env.TEST_ONLY_ENV_KEY;
    } else {
      process.env.TEST_ONLY_ENV_KEY = previous;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loadProjectEnvIntoProcess preserves explicit env unless override is enabled", () => {
  const root = makeTempProjectRoot();
  const previous = process.env.TEST_ONLY_ENV_KEY;
  try {
    fs.writeFileSync(path.join(root, PROJECT_ENV_DEV_FILE), "TEST_ONLY_ENV_KEY=from-file\n");
    process.env.TEST_ONLY_ENV_KEY = "from-process";

    assert.deepEqual(loadProjectEnvIntoProcess(root), {
      TEST_ONLY_ENV_KEY: "from-file",
    });
    assert.equal(process.env.TEST_ONLY_ENV_KEY, "from-process");
  } finally {
    if (previous === undefined) {
      delete process.env.TEST_ONLY_ENV_KEY;
    } else {
      process.env.TEST_ONLY_ENV_KEY = previous;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
