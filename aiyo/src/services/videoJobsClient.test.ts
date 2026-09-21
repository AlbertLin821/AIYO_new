import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resumePendingVideoJobs, setVideoJobOwner, waitForVideoJob } from "./videoJobsClient";

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  setVideoJobOwner("owner-a");
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  setVideoJobOwner(null);
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

test("expired login retains the job for the original owner to resume", async () => {
  globalThis.fetch = async () => Response.json({ success: false, error: { message: "Login required" } }, { status: 401 });
  await assert.rejects(waitForVideoJob({ jobId: "expired", videoId: "video", ownerId: "owner-a" }), /Login required/);
  assert.match(values.get("aiyo-video-jobs-v2:owner-a")!, /expired/);
});

test("another account neither polls nor removes the original account's jobs", async () => {
  const saved = JSON.stringify([{ jobId: "private", videoId: "video", ownerId: "owner-a" }]);
  values.set("aiyo-video-jobs-v2:owner-a", saved);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  resumePendingVideoJobs("owner-b");
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(values.get("aiyo-video-jobs-v2:owner-a"), saved);
});

test("account change during a request cannot deliver its result or erase its recovery record", async () => {
  globalThis.fetch = async () => {
    setVideoJobOwner("owner-b");
    return Response.json({ success: true, data: { state: "completed", progress: { label: "完成" }, result: { video: { videoId: "private-video" } } } });
  };
  await assert.rejects(waitForVideoJob({ jobId: "switch", videoId: "video", ownerId: "owner-a" }), /登入狀態已變更/);
  assert.match(values.get("aiyo-video-jobs-v2:owner-a")!, /switch/);
});
