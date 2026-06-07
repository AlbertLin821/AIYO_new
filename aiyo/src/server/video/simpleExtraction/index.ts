import { serverConfig } from "@/server/config";
import { cleanPlaceMentionName } from "@/server/video/placeMentionNormalizer";
import { extractPlacesAndFoodsFromChunk, resolveSimpleExtractionModel } from "@/server/video/simpleExtraction/simpleOllamaExtractor";
import { mergeSimpleExtractionResults } from "@/server/video/simpleExtraction/mergeExtractionResults";
import { buildTranscriptChunks } from "@/server/video/simpleExtraction/transcriptChunker";
import type { TranscriptChunk } from "@/server/video/simpleExtraction/transcriptChunker";
import type { SimpleVideoExtractionChunkResult, SimpleVideoExtractionResult } from "@/server/video/simpleExtraction/types";
import { selectTravelExtractionProfile } from "@/server/video/travelExtractionProfiles";
import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";

const SIMPLE_VIDEO_PIPELINE_VERSION = "video-simple-ollama-v2";

type ChunkFailure = {
  chunkIndex: number;
  reason: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

async function extractChunkResult(input: {
  chunk: TranscriptChunk;
  model: string;
  timeoutMs: number;
}): Promise<SimpleVideoExtractionChunkResult> {
  return extractPlacesAndFoodsFromChunk({
    chunkText: input.chunk.text,
    chunkIndex: input.chunk.chunkIndex,
    model: input.model,
    timeoutMs: input.timeoutMs,
  });
}

async function retryFailedTranscriptChunks(input: {
  chunks: TranscriptChunk[];
  chunkResults: SimpleVideoExtractionChunkResult[];
  failedChunks: ChunkFailure[];
  model: string;
  baseTimeoutMs: number;
}): Promise<void> {
  if (input.failedChunks.length === 0) {
    return;
  }

  const retryTimeoutMs = Math.floor(input.baseTimeoutMs * 1.35);
  const pending = [...input.failedChunks];
  input.failedChunks.length = 0;

  for (const failure of pending) {
    const arrayIndex = input.chunks.findIndex((chunk) => chunk.chunkIndex === failure.chunkIndex);
    if (arrayIndex < 0) {
      continue;
    }
    const chunk = input.chunks[arrayIndex];
    if (!chunk) {
      continue;
    }

    try {
      input.chunkResults[arrayIndex] = await extractChunkResult({
        chunk,
        model: input.model,
        timeoutMs: retryTimeoutMs,
      });
    } catch (error) {
      const reason = errorMessage(error);
      input.failedChunks.push({
        chunkIndex: failure.chunkIndex,
        reason,
      });
      console.warn("[simple-video-extraction] Chunk retry failed.", {
        chunkIndex: failure.chunkIndex,
        model: input.model,
        reason,
      });
    }
  }
}

function postProcessSimplePlaces(input: {
  places: SimpleVideoExtractionResult["places"];
  destinationHint?: string;
  transcriptLanguage?: string;
  title: string;
  description?: string;
}): SimpleVideoExtractionResult["places"] {
  const profile = selectTravelExtractionProfile({
    transcriptLanguage: input.transcriptLanguage,
    title: input.title,
    description: input.description,
  });
  const seen = new Set<string>();
  const out: SimpleVideoExtractionResult["places"] = [];

  for (const place of input.places) {
    const cleaned = cleanPlaceMentionName(place.name, profile, input.destinationHint);
    const name = cleaned.cleanedName.trim();
    if (!name || cleaned.rejectedReason) {
      continue;
    }
    const key = name.replace(/\s+/g, "").toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      ...place,
      name,
    });
  }

  return out;
}

export async function extractSimpleVideoPlacesAndFoods(input: {
  title: string;
  description?: string;
  transcriptLines: NormalizedTranscriptLine[];
  model?: string;
  destinationHint?: string;
  transcriptLanguage?: string;
}): Promise<SimpleVideoExtractionResult> {
  const chunkTimeoutMs = Math.max(120_000, serverConfig.ollamaTimeoutMs);
  const chunks = buildTranscriptChunks({
    title: input.title,
    description: input.description,
    transcriptLines: input.transcriptLines,
    maxCharsPerChunk: serverConfig.videoExtractionChunkMaxChars,
    overlapChars: serverConfig.videoExtractionChunkOverlapChars,
  }).slice(0, serverConfig.videoExtractionChunkMaxCount);

  const model = resolveSimpleExtractionModel(input.model);
  const failedChunks: ChunkFailure[] = [];
  const chunkResults = await mapWithConcurrency(
    chunks,
    serverConfig.videoExtractionChunkConcurrency,
    async (chunk): Promise<SimpleVideoExtractionChunkResult> => {
      try {
        return await extractChunkResult({
          chunk,
          model,
          timeoutMs: chunkTimeoutMs,
        });
      } catch (error) {
        const reason = errorMessage(error);
        failedChunks.push({
          chunkIndex: chunk.chunkIndex,
          reason,
        });
        console.warn("[simple-video-extraction] Chunk failed; continuing with partial extraction.", {
          chunkIndex: chunk.chunkIndex,
          model,
          reason,
        });
        return { places: [], foods: [] };
      }
    },
  );

  await retryFailedTranscriptChunks({
    chunks,
    chunkResults,
    failedChunks,
    model,
    baseTimeoutMs: chunkTimeoutMs,
  });

  const rawPlaceCount = chunkResults.reduce((sum, result) => sum + result.places.length, 0);
  const rawFoodCount = chunkResults.reduce((sum, result) => sum + result.foods.length, 0);
  const merged = mergeSimpleExtractionResults({ chunkResults });
  const postProcessedPlaces = postProcessSimplePlaces({
    places: merged.places,
    destinationHint: input.destinationHint,
    transcriptLanguage: input.transcriptLanguage,
    title: input.title,
    description: input.description,
  });

  return {
    places: postProcessedPlaces,
    foods: merged.foods,
    debug: {
      chunkCount: chunks.length,
      model,
      pipelineVersion: SIMPLE_VIDEO_PIPELINE_VERSION,
      rawPlaceCount,
      rawFoodCount,
      finalPlaceCount: postProcessedPlaces.length,
      finalFoodCount: merged.foods.length,
      failedChunkCount: failedChunks.length,
      failedChunks: failedChunks.length ? failedChunks : undefined,
    },
  };
}

export * from "@/server/video/simpleExtraction/types";
export * from "@/server/video/simpleExtraction/transcriptChunker";
export * from "@/server/video/simpleExtraction/simpleOllamaExtractor";
export * from "@/server/video/simpleExtraction/mergeExtractionResults";
