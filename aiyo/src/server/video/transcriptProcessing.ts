import type { TranscriptEntry } from "@/server/providers/youtubeProvider";
import type { TravelExtractionProfile } from "@/server/video/travelExtractionProfiles";

export type NormalizedTranscriptLine = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  rawText: string;
};

export type TranscriptWindow = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  lineIds: string[];
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripKnownPrefix(text: string, profile: TravelExtractionProfile): string {
  const lower = text.toLowerCase();
  for (const prefix of profile.fillerPrefixes) {
    const p = prefix.trim();
    if (!p) {
      continue;
    }
    const lp = p.toLowerCase();
    if (lower.startsWith(lp)) {
      return text.slice(p.length).replace(/^[,，。:\-\s]+/, "").trim();
    }
  }
  return text;
}

export function preprocessTranscript(
  entries: TranscriptEntry[],
  profile: TravelExtractionProfile,
): NormalizedTranscriptLine[] {
  const out: NormalizedTranscriptLine[] = [];
  const seen = new Set<string>();
  let index = 0;

  for (const entry of entries) {
    const rawText = normalizeWhitespace(entry.text || "");
    if (!rawText) {
      continue;
    }

    const dedupeKey = `${Math.floor(entry.startSeconds)}:${rawText}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const stripped = stripKnownPrefix(rawText, profile);
    const text = normalizeWhitespace(stripped || rawText);
    const endSeconds = Math.max(entry.startSeconds + Math.max(1, entry.durationSeconds), entry.startSeconds + 1);
    out.push({
      id: `line_${++index}`,
      startSeconds: entry.startSeconds,
      endSeconds,
      text,
      rawText,
    });
  }

  const merged: NormalizedTranscriptLine[] = [];
  for (const line of out) {
    const last = merged[merged.length - 1];
    const isShort = line.text.length <= 10;
    const isNear = last && line.startSeconds - last.endSeconds <= 2;
    if (last && isShort && isNear) {
      last.text = normalizeWhitespace(`${last.text} ${line.text}`);
      last.endSeconds = Math.max(last.endSeconds, line.endSeconds);
      continue;
    }
    merged.push({ ...line });
  }

  return merged;
}

export function buildTranscriptWindows(
  lines: NormalizedTranscriptLine[],
  options?: { maxChars?: number; maxDurationSeconds?: number; maxLines?: number },
): TranscriptWindow[] {
  const maxChars = options?.maxChars ?? 320;
  const maxDurationSeconds = options?.maxDurationSeconds ?? 100;
  const maxLines = options?.maxLines ?? 5;

  const windows: TranscriptWindow[] = [];
  let current: NormalizedTranscriptLine[] = [];
  let charCount = 0;

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    windows.push({
      id: `window_${windows.length + 1}`,
      startSeconds: current[0].startSeconds,
      endSeconds: current[current.length - 1].endSeconds,
      text: normalizeWhitespace(current.map((line) => line.text).join(" ")),
      lineIds: current.map((line) => line.id),
    });
    current = [];
    charCount = 0;
  };

  for (const line of lines) {
    const projectedChars = charCount + line.text.length;
    const projectedDuration =
      current.length > 0 ? line.endSeconds - current[0].startSeconds : line.endSeconds - line.startSeconds;
    if (
      current.length > 0 &&
      (projectedChars > maxChars || projectedDuration > maxDurationSeconds || current.length >= maxLines)
    ) {
      flush();
    }
    current.push(line);
    charCount += line.text.length;
  }

  flush();
  return windows;
}
