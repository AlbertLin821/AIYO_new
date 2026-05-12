import assert from "node:assert/strict";
import test from "node:test";
import { dedupeCanonicalPlaces } from "@/server/video/placeExtraction/placeDeduper";
import type { CanonicalPlaceCandidate } from "@/server/video/placeExtraction/types";

function candidate(partial: Partial<CanonicalPlaceCandidate> & Pick<CanonicalPlaceCandidate, "rawText" | "cleanedName" | "canonicalName" | "source" | "confidence">): CanonicalPlaceCandidate {
  return {
    canonicalId: partial.canonicalId ?? partial.canonicalName.toLowerCase().replace(/\s+/g, ""),
    aliases: partial.aliases ?? [partial.cleanedName],
    ...partial,
  };
}

test("dedupeCanonicalPlaces merges canonical variants and preserves first mention", () => {
  const deduped = dedupeCanonicalPlaces([
    candidate({
      rawText: "熊本站",
      cleanedName: "熊本站",
      canonicalName: "熊本車站",
      source: "transcript",
      confidence: 0.74,
      startSeconds: 50,
      evidenceTexts: ["熊本站"],
    }),
    candidate({
      rawText: "直達熊本站",
      cleanedName: "熊本站",
      canonicalName: "熊本車站",
      source: "transcript",
      confidence: 0.82,
      startSeconds: 30,
      evidenceTexts: ["直達熊本站"],
    }),
  ]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].canonicalName, "熊本車站");
  assert.equal(deduped[0].startSeconds, 30);
  assert.equal(deduped[0].confidence, 0.82);
  assert.ok((deduped[0].evidenceTexts || []).length <= 3);
});
