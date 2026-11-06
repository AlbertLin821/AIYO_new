import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentProposalSchema, previewRequestSchema } from "./schemas";

describe("agent proposal boundary", () => {
  it("rejects executable or extra model fields", () => {
    assert.equal(agentProposalSchema.safeParse({ version: 1, operations: [{ type: "run_sql", query: "DELETE FROM trips" }], explanation: "" }).success, false);
    assert.equal(agentProposalSchema.safeParse({ version: 1, operations: [{ type: "remove_item", itemId: "item-1", tripId: "other" }], explanation: "" }).success, false);
  });

  it("rejects oversized and malformed requests", () => {
    assert.equal(previewRequestSchema.safeParse({ instruction: "x".repeat(2001), baseRevision: 0 }).success, false);
    assert.equal(previewRequestSchema.safeParse({ instruction: "第二天下午改室內", baseRevision: -1 }).success, false);
  });

  it("accepts a bounded item move", () => {
    assert.equal(agentProposalSchema.safeParse({ version: 1, operations: [{ type: "move_item", itemId: "item-1", toDay: 2, afterItemId: null }], explanation: "移至第二天" }).success, true);
  });
});
