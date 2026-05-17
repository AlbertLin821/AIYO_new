import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";

const DEFAULT_MAX_CHARS_PER_CHUNK = 12_000;
const DEFAULT_OVERLAP_CHARS = 500;
const DEFAULT_MAX_CHUNK_COUNT = 8;

type TranscriptChunk = {
  chunkIndex: number;
  text: string;
  startSeconds?: number;
  endSeconds?: number;
};

function normalizeLineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatTranscriptLine(line: NormalizedTranscriptLine): string {
  return `[${Math.max(0, Math.floor(line.startSeconds))}s] ${normalizeLineText(line.text)}`;
}

function buildHeader(input: { title: string; description?: string }): string {
  const parts = [`標題：${normalizeLineText(input.title)}`];
  const description = normalizeLineText(input.description || "");
  if (description) {
    parts.push(`敘述：${description}`);
  }
  return parts.join("\n");
}

function linesCharCount(lines: NormalizedTranscriptLine[]): number {
  return lines.reduce((sum, line) => sum + formatTranscriptLine(line).length + 1, 0);
}

function buildChunkText(header: string, lines: NormalizedTranscriptLine[], includeHeader: boolean): string {
  const transcriptText = lines.map((line) => formatTranscriptLine(line)).join("\n");
  if (includeHeader) {
    return transcriptText ? `${header}\n\n${transcriptText}` : header;
  }
  return transcriptText;
}

export function buildTranscriptChunks(input: {
  title: string;
  description?: string;
  transcriptLines: NormalizedTranscriptLine[];
  maxCharsPerChunk?: number;
  overlapChars?: number;
}): TranscriptChunk[] {
  const maxCharsPerChunk = Math.max(1_000, input.maxCharsPerChunk ?? DEFAULT_MAX_CHARS_PER_CHUNK);
  const overlapChars = Math.max(0, input.overlapChars ?? DEFAULT_OVERLAP_CHARS);
  const header = buildHeader({ title: input.title, description: input.description });
  const chunks: TranscriptChunk[] = [];
  const lines = input.transcriptLines
    .filter((line) => normalizeLineText(line.text).length > 0)
    .sort((left, right) => left.startSeconds - right.startSeconds);

  if (lines.length === 0) {
    return [
      {
        chunkIndex: 0,
        text: header,
      },
    ];
  }

  let index = 0;
  let current: NormalizedTranscriptLine[] = [];
  let currentChars = 0;

  const flush = (forceAllRemaining = false) => {
    if (current.length === 0) {
      return;
    }
    const includeHeader = chunks.length === 0;
    const remainingLines = forceAllRemaining ? lines.slice(index) : [];
    const chunkLines = forceAllRemaining ? [...current, ...remainingLines] : [...current];
    const chunkText = buildChunkText(header, chunkLines, includeHeader);
    chunks.push({
      chunkIndex: chunks.length,
      text: chunkText,
      startSeconds: chunkLines[0]?.startSeconds,
      endSeconds: chunkLines[chunkLines.length - 1]?.endSeconds,
    });
    if (forceAllRemaining) {
      index = lines.length;
      current = [];
      currentChars = 0;
      return;
    }

    if (chunks.length >= DEFAULT_MAX_CHUNK_COUNT) {
      current = [];
      currentChars = 0;
      return;
    }

    const overlap: NormalizedTranscriptLine[] = [];
    let overlapCount = 0;
    for (let i = chunkLines.length - 1; i >= 0; i -= 1) {
      const line = chunkLines[i];
      overlap.unshift(line);
      overlapCount += formatTranscriptLine(line).length + 1;
      if (overlapCount >= overlapChars) {
        break;
      }
    }
    current = overlap;
    currentChars = linesCharCount(current);
  };

  while (index < lines.length && chunks.length < DEFAULT_MAX_CHUNK_COUNT) {
    const line = lines[index];
    const lineText = formatTranscriptLine(line);
    const chunkBaseChars = chunks.length === 0 ? header.length + 2 : 0;
    const projectedChars = chunkBaseChars + currentChars + lineText.length + 1;

    if (current.length > 0 && projectedChars > maxCharsPerChunk) {
      if (chunks.length === DEFAULT_MAX_CHUNK_COUNT - 1) {
        flush(true);
        break;
      }
      flush();
      const projectedAfterOverlap = currentChars + lineText.length + 1;
      if (current.length > 0 && projectedAfterOverlap > maxCharsPerChunk) {
        current = [];
        currentChars = 0;
      }
      continue;
    }

    current.push(line);
    currentChars += lineText.length + 1;
    index += 1;
  }

  if (current.length > 0 && chunks.length < DEFAULT_MAX_CHUNK_COUNT) {
    flush(index < lines.length);
  }

  return chunks.slice(0, DEFAULT_MAX_CHUNK_COUNT);
}
