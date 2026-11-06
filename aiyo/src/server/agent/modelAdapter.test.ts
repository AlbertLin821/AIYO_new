import assert from "node:assert/strict";
import { it } from "node:test";
import type { PersistedTripPayload } from "@/types";
import { normalizeMoveProposalTimes, requiresMoveOnlyProposal } from "./modelAdapter";

it("constrains a clear move instruction without restricting mixed edits", () => {
  assert.equal(requiresMoveOnlyProposal("把第一天的弘大移到第二天景福宮後面，保留其他地點"), true);
  assert.equal(requiresMoveOnlyProposal("把弘大移到第二天並加入一間餐廳"), false);
  assert.equal(requiresMoveOnlyProposal("把秋葉原換成晴空塔"), false);
  assert.equal(requiresMoveOnlyProposal("移除第一天的景點"), false);
});

it("repairs an inferred move time only when the user did not specify an exact time", () => {
  const trip: PersistedTripPayload = {
    tripId: "trip", title: "首爾", destination: "首爾", days: 2, pins: [], updatedAt: "2026-11-06T00:00:00Z",
    itinerary: [
      { dayNumber: 1, items: [{ id: "hongdae", title: "弘大", time: "10:00", type: "activity" }] },
      { dayNumber: 2, items: [
        { id: "palace", title: "景福宮", time: "09:30", type: "activity" },
        { id: "bukchon", title: "北村韓屋村", time: "14:00", type: "activity" },
      ] },
    ],
  };
  const proposal = { version: 1 as const, explanation: "搬移", operations: [{ type: "move_item" as const, itemId: "hongdae", toDay: 2, afterItemId: "palace", time: "16:00" }] };
  assert.equal(normalizeMoveProposalTimes(proposal, trip, "把弘大移到第二天景福宮後面").operations[0].time, "10:30");
  assert.equal(normalizeMoveProposalTimes(proposal, trip, "把弘大在 16:00 移到第二天景福宮後面").operations[0].time, "16:00");
  assert.equal(normalizeMoveProposalTimes(proposal, trip, "把弘大移到第二天下午景福宮後面").operations[0].time, "16:00");
  assert.equal(proposal.operations[0].time, "16:00");
});
