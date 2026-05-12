import type { CanonicalPlaceCandidate } from "@/server/video/placeExtraction/types";

function normalizedKey(candidate: CanonicalPlaceCandidate): string {
  return (candidate.canonicalId || candidate.canonicalName).toLowerCase().replace(/\s+/g, "");
}

export function dedupeCanonicalPlaces(
  candidates: CanonicalPlaceCandidate[],
): CanonicalPlaceCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    const aStart = a.startSeconds ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.startSeconds ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });
  const merged = new Map<string, CanonicalPlaceCandidate>();

  for (const candidate of sorted) {
    const key = normalizedKey(candidate);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...candidate,
        aliases: Array.from(new Set(candidate.aliases)),
        evidenceTexts: Array.from(new Set((candidate.evidenceTexts || [candidate.rawText]).filter(Boolean))).slice(0, 3),
        sourceTranscriptLineIds: Array.from(new Set(candidate.sourceTranscriptLineIds || [])),
      });
      continue;
    }

    existing.startSeconds =
      existing.startSeconds === undefined
        ? candidate.startSeconds
        : candidate.startSeconds === undefined
          ? existing.startSeconds
          : Math.min(existing.startSeconds, candidate.startSeconds);
    existing.endSeconds = Math.max(existing.endSeconds ?? 0, candidate.endSeconds ?? 0) || undefined;
    existing.confidence = Math.max(existing.confidence, candidate.confidence);
    existing.aliases = Array.from(new Set([...existing.aliases, ...candidate.aliases]));
    existing.sourceTranscriptLineIds = Array.from(
      new Set([...(existing.sourceTranscriptLineIds || []), ...(candidate.sourceTranscriptLineIds || [])]),
    );
    existing.evidenceTexts = Array.from(
      new Set([...(existing.evidenceTexts || []), ...(candidate.evidenceTexts || []), candidate.rawText, candidate.context || ""]),
    )
      .filter(Boolean)
      .slice(0, 3);
    if (!existing.context && candidate.context) {
      existing.context = candidate.context;
    }
    if (!existing.type && candidate.type) {
      existing.type = candidate.type;
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aStart = a.startSeconds ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.startSeconds ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });
}
