import { serverConfig } from "@/server/config";
import { extractPlacesAndFoodsFromChunk, resolveSimpleExtractionModel } from "@/server/video/simpleExtraction/simpleOllamaExtractor";
import { mergeSimpleExtractionResults } from "@/server/video/simpleExtraction/mergeExtractionResults";
import { buildTranscriptChunks } from "@/server/video/simpleExtraction/transcriptChunker";
import type { SimpleVideoExtractionChunkResult, SimpleVideoExtractionResult } from "@/server/video/simpleExtraction/types";
import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";

const SIMPLE_VIDEO_PIPELINE_VERSION = "video-simple-ollama-v1";

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

export async function extractSimpleVideoPlacesAndFoods(input: {
  title: string;
  description?: string;
  transcriptLines: NormalizedTranscriptLine[];
  model?: string;
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
        return await extractPlacesAndFoodsFromChunk({
          chunkText: chunk.text,
          chunkIndex: chunk.chunkIndex,
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

  const rawPlaceCount = chunkResults.reduce((sum, result) => sum + result.places.length, 0);
  const rawFoodCount = chunkResults.reduce((sum, result) => sum + result.foods.length, 0);
  const merged = mergeSimpleExtractionResults({ chunkResults });

  return {
    places: merged.places,
    foods: merged.foods,
    debug: {
      chunkCount: chunks.length,
      model,
      pipelineVersion: SIMPLE_VIDEO_PIPELINE_VERSION,
      rawPlaceCount,
      rawFoodCount,
      finalPlaceCount: merged.places.length,
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
