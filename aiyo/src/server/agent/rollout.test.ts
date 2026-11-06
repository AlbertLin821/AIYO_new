import assert from "node:assert/strict";
import test from "node:test";
import { agentPreviewBucket, isAgentPreviewEnabled } from "./rollout";

test("agent preview rollout keeps users in a stable cohort", () => {
  const userId = "stable-user";
  const original = process.env.AGENT_PREVIEW_ROLLOUT_PERCENT;
  try {
    const bucket = agentPreviewBucket(userId);
    assert.equal(bucket, agentPreviewBucket(userId));
    assert.ok(bucket >= 0 && bucket < 100);
    process.env.AGENT_PREVIEW_ROLLOUT_PERCENT = "0";
    assert.equal(isAgentPreviewEnabled(userId), false);
    process.env.AGENT_PREVIEW_ROLLOUT_PERCENT = "100";
    assert.equal(isAgentPreviewEnabled(userId), true);
    process.env.AGENT_PREVIEW_ROLLOUT_PERCENT = String(bucket);
    assert.equal(isAgentPreviewEnabled(userId), false);
    process.env.AGENT_PREVIEW_ROLLOUT_PERCENT = String(bucket + 1);
    assert.equal(isAgentPreviewEnabled(userId), true);
    process.env.AGENT_PREVIEW_ROLLOUT_PERCENT = "not-a-percentage";
    assert.equal(isAgentPreviewEnabled(userId), false);
  } finally {
    if (original === undefined) delete process.env.AGENT_PREVIEW_ROLLOUT_PERCENT;
    else process.env.AGENT_PREVIEW_ROLLOUT_PERCENT = original;
  }
});
