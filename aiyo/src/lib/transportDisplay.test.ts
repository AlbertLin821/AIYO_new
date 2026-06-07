import assert from "node:assert/strict";
import test from "node:test";

import { zhTW as t } from "@/locales/zh-TW";

import { transportDisplayLabel } from "./transportDisplay";

test("transportDisplayLabel localizes internal AI transport values", () => {
  assert.equal(transportDisplayLabel("ai_recommend"), t.itineraryPanel.segmentTransport);
  assert.equal(transportDisplayLabel("ai recommend"), t.itineraryPanel.segmentTransport);
  assert.equal(transportDisplayLabel("ai recommond"), t.itineraryPanel.segmentTransport);
});

test("transportDisplayLabel localizes common transport names", () => {
  assert.equal(transportDisplayLabel("public_transport"), t.itineraryPanel.transportTransit);
  assert.equal(transportDisplayLabel("taxi"), t.itineraryPanel.transportTaxi);
});
