import assert from "node:assert/strict";
import { test } from "node:test";
import { redisConnection } from "./videoJobs";

test("HTTP queue connections fail fast while workers reconnect", () => {
  assert.equal(redisConnection().retryStrategy?.(), null);
  assert.equal(redisConnection().maxRetriesPerRequest, 1);
  assert.equal(redisConnection(true).retryStrategy, undefined);
  assert.equal(redisConnection(true).maxRetriesPerRequest, null);
});
