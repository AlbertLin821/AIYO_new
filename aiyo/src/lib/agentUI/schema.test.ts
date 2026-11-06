import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agentUISchema } from "./schema";

describe("agent UI boundary", () => {
  it("rejects unknown kinds, injected handlers and unsafe links", () => {
    assert.equal(agentUISchema.safeParse({ version: 1, components: [{ kind: "html", actionId: "x", props: { html: "<script>x</script>" } }] }).success, false);
    assert.equal(agentUISchema.safeParse({ version: 1, components: [{ kind: "confirm_button", actionId: "apply", props: { label: "確認", onClick: "evil()" } }] }).success, false);
    assert.equal(agentUISchema.safeParse({ version: 1, components: [{ kind: "place_card", actionId: "open", props: { title: "景點", sourceUrl: "javascript:alert(1)" } }] }).success, false);
  });

  it("accepts a bounded versioned diff", () => {
    assert.equal(agentUISchema.safeParse({ version: 1, components: [{ kind: "itinerary_diff", actionId: "change_1", props: { summary: "第二天下午改室內", before: "公園", after: "博物館" } }] }).success, true);
  });
});
