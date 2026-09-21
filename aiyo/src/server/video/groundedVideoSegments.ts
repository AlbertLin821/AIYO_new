import type { VideoSummarySegment } from "@/types";
import type { NormalizedTranscriptLine } from "./transcriptProcessing";
import type { SimpleExtractedFood, SimpleExtractedPlace } from "./simpleExtraction/types";

const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");

/** Model timestamps are hints only. A seekable moment must name the place in a real cue. */
export function buildGroundedVideoSegments(input: {
  places: SimpleExtractedPlace[];
  foods: SimpleExtractedFood[];
  transcriptLines: NormalizedTranscriptLine[];
}): VideoSummarySegment[] {
  const lines = input.transcriptLines.filter((line) =>
    line.timestampSource !== "description-fallback" && line.timestampConfidence !== "low" &&
    Number.isFinite(line.startSeconds) && line.startSeconds >= 0 &&
    Number.isFinite(line.endSeconds) && line.endSeconds > line.startSeconds);
  return input.places.flatMap((place): VideoSummarySegment[] => {
    const name = normalize(place.name);
    if (name.length < 2) return [];
    const matches = lines.filter((line) => normalize(line.text).includes(name));
    const hint = place.startSeconds;
    matches.sort((a, b) => typeof hint === "number" && Number.isFinite(hint)
      ? Math.abs(a.startSeconds - hint) - Math.abs(b.startSeconds - hint)
      : a.startSeconds - b.startSeconds);
    const line = matches[0];
    if (!line) return [];
    const seconds = Math.floor(line.startSeconds);
    const hours = Math.floor(seconds / 3600);
    const clock = `${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    const timestamp = hours ? `${hours}:${clock}` : clock;
    return [{
      id: `grounded_${line.id}_${place.name}`, title: place.name,
      timestamp, startLabel: timestamp, startSeconds: line.startSeconds, endSeconds: line.endSeconds,
      text: line.text, summary: line.text, locationHints: [place.name],
      foods: input.foods.filter((food) => normalize(food.name).length >= 2 && normalize(line.text).includes(normalize(food.name))).map((food) => food.name),
      sourceTranscriptLineIds: [line.id], timestampSource: "youtube-transcript",
      timestampConfidence: "high", extractionSource: "ai-polished",
    }];
  }).sort((a, b) => a.startSeconds! - b.startSeconds!).slice(0, 8);
}
