import assert from "node:assert/strict";
import test from "node:test";
import {
  groupItinerariesForLanding,
  landingDropFolderId,
  LANDING_DROP_UNFILED,
  parseLandingDropId,
} from "@/lib/itinerary-grouping";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import type { ItineraryFolderDto } from "@/services/itineraryClient";

const folders: ItineraryFolderDto[] = [
  { id: "f1", name: "美食", sortOrder: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  { id: "f2", name: "古蹟", sortOrder: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
];

function trip(
  id: string,
  folderId?: string | null,
): ItineraryListItem {
  return {
    id,
    title: id,
    destination: "台北",
    days: 2,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
    folderId,
  };
}

test("groupItinerariesForLanding splits unfiled and folders", () => {
  const result = groupItinerariesForLanding(
    [trip("u1"), trip("t1", "f1"), trip("t2", "f2")],
    folders,
  );
  assert.deepEqual(result.unfiled.map((item) => item.id), ["u1"]);
  assert.equal(result.folderGroups.length, 2);
  assert.equal(result.folderGroups[0]?.folder.id, "f2");
  assert.deepEqual(result.folderGroups[0]?.trips.map((item) => item.id), ["t2"]);
  assert.equal(result.folderGroups[1]?.folder.id, "f1");
  assert.deepEqual(result.folderGroups[1]?.trips.map((item) => item.id), ["t1"]);
});

test("groupItinerariesForLanding hides empty folders after filter", () => {
  const result = groupItinerariesForLanding([trip("t1", "f1")], folders);
  assert.equal(result.folderGroups.length, 1);
  assert.equal(result.folderGroups[0]?.folder.id, "f1");
});

test("groupItinerariesForLanding puts orphan folderId into unfiled", () => {
  const result = groupItinerariesForLanding([trip("orphan", "missing")], folders);
  assert.deepEqual(result.unfiled.map((item) => item.id), ["orphan"]);
  assert.equal(result.folderGroups.length, 0);
});

test("parseLandingDropId maps drop zones", () => {
  assert.equal(parseLandingDropId(LANDING_DROP_UNFILED), null);
  assert.equal(parseLandingDropId(landingDropFolderId("f1")), "f1");
  assert.equal(parseLandingDropId("unknown"), null);
});
