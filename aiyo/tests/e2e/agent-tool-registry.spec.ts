import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { createAgentToolRegistry } from "@/server/agent/toolRegistry";
import { resetE2EData, seedAuthUsers, seedTripForUser } from "./helpers/db";

test("agent read tools enforce a trip-bound allowlist, schemas, limits, and collaborator ACL", async () => {
  await resetE2EData();
  try {
    const { owner, collaborator } = await seedAuthUsers();
    const trip = await seedTripForUser(owner.id);
    const ownerTools = createAgentToolRegistry(owner.id, trip.id);
    await assert.rejects(() => ownerTools.call("execute_sql", {}), /unknown_agent_tool/);
    await assert.rejects(() => ownerTools.call("read_trip", { tripId: "other" }), /invalid_agent_tool_input/);
    const current = await ownerTools.readTrip();
    assert.equal(current.tripId, trip.id);
    await assert.rejects(() => ownerTools.readTrip(), /agent_tool_limit/);
    await assert.rejects(() => ownerTools.validateSchedule({
      version: 1, explanation: "加入未查證地點", operations: [
        { type: "add_item", day: 1, placeId: "fabricated", time: "15:00", afterItemId: current.itinerary[0].items.at(-1)?.id ?? null },
      ],
    }), /unverified_place/);

    const foreignTools = createAgentToolRegistry(collaborator.id, trip.id);
    await assert.rejects(() => foreignTools.readTrip(), /forbidden/);
    await prisma.tripCollaborator.create({ data: { tripId: trip.id, userId: collaborator.id, role: "viewer" } });
    const viewerTools = createAgentToolRegistry(collaborator.id, trip.id);
    assert.equal((await viewerTools.readTrip()).tripId, trip.id);
  } finally {
    await resetE2EData();
  }
});
