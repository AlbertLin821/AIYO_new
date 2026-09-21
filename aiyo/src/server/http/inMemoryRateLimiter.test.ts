import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryRateLimiter } from "./inMemoryRateLimiter";

test("rate limiter rejects excess requests and resets without sleeping", () => {
  let now = 1_000;
  const limiter = new InMemoryRateLimiter(2, 1_000, () => now);
  assert.deepEqual(limiter.consume("client"), { allowed: true, remaining: 1 });
  assert.deepEqual(limiter.consume("client"), { allowed: true, remaining: 0 });
  assert.deepEqual(limiter.consume("client"), { allowed: false, retryAfterSeconds: 1 });
  now = 2_000;
  assert.deepEqual(limiter.consume("client"), { allowed: true, remaining: 1 });
});
