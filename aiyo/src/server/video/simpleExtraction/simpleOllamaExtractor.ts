import { chatWithOllama, resolveModelForTask } from "@/server/ai/ollamaClient";
import { extractJsonBlock } from "@/server/ai/responseParser";
import { serverConfig } from "@/server/config";
import type {
  SimpleExtractedFood,
  SimpleExtractedPlace,
  SimpleVideoExtractionChunkResult,
} from "@/server/video/simpleExtraction/types";

const SIMPLE_EXTRACTION_PROMPT = `以下是 YouTube 影片的標題、敘述欄與字幕內容。
請根據內容整理出兩類資料：
1. 景點或地點名稱
2. 食物名稱
只輸出影片內容中明確提到的名稱。
不要輸出完整句子。
不要輸出交通描述。
不要輸出重複項目。
不要自己猜測影片沒有提到的內容。
請用繁體中文輸出。
如果原文是英文、日文或韓文地名，可以保留原文名稱。
嚴格只輸出 JSON格式就好。
輸出格式：

{
  "places": [
    {
      "name": "景點或地點名稱",
      "type": "attraction | landmark | restaurant | shop | station | market | district | hotel | transport | unknown",
      "evidence": "字幕或敘述欄中支持這個名稱的短句",
      "startSeconds": 123
    }
  ],
  "foods": [
    {
      "name": "食物名稱",
      "evidence": "字幕或敘述欄中支持這個名稱的短句",
      "startSeconds": 123
    }
  ]
}

以下是影片內容：

{{CHUNK_TEXT}}`;

const ALLOWED_PLACE_TYPES = new Set([
  "attraction",
  "landmark",
  "restaurant",
  "shop",
  "station",
  "market",
  "district",
  "hotel",
  "transport",
  "unknown",
]);

function normalizeName(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[「『【(（\[]+/, "")
    .replace(/[」』】)）\]]+$/, "")
    .trim();
}

function sanitizeStartSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function sanitizePlace(item: unknown): SimpleExtractedPlace | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const record = item as Record<string, unknown>;
  const name = normalizeName(record.name);
  if (!name) {
    return null;
  }
  const rawType = normalizeName(record.type).toLowerCase();
  const type = ALLOWED_PLACE_TYPES.has(rawType) ? (rawType as SimpleExtractedPlace["type"]) : "unknown";
  const evidence = normalizeName(record.evidence);
  return {
    name,
    type,
    evidence: evidence || undefined,
    startSeconds: sanitizeStartSeconds(record.startSeconds),
  };
}

function sanitizeFood(item: unknown): SimpleExtractedFood | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const record = item as Record<string, unknown>;
  const name = normalizeName(record.name);
  if (!name) {
    return null;
  }
  const evidence = normalizeName(record.evidence);
  return {
    name,
    evidence: evidence || undefined,
    startSeconds: sanitizeStartSeconds(record.startSeconds),
  };
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.name.replace(/\s+/g, "").toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseChunkResult(raw: string): SimpleVideoExtractionChunkResult {
  const jsonBlock = extractJsonBlock(raw) || raw;
  const parsed = JSON.parse(jsonBlock) as { places?: unknown[]; foods?: unknown[] };
  return {
    places: dedupeByName(Array.isArray(parsed.places) ? parsed.places.map(sanitizePlace).filter(Boolean) as SimpleExtractedPlace[] : []),
    foods: dedupeByName(Array.isArray(parsed.foods) ? parsed.foods.map(sanitizeFood).filter(Boolean) as SimpleExtractedFood[] : []),
  };
}

export async function extractPlacesAndFoodsFromChunk(input: {
  chunkText: string;
  chunkIndex: number;
  model?: string;
  timeoutMs?: number;
}): Promise<SimpleVideoExtractionChunkResult> {
  const content = SIMPLE_EXTRACTION_PROMPT.replace("{{CHUNK_TEXT}}", input.chunkText);
  const raw = await chatWithOllama({
    messages: [
      {
        role: "user",
        content,
      },
    ],
    format: "json",
    model: input.model || serverConfig.ollamaLocationModel,
    timeoutMs: input.timeoutMs ?? 120_000,
    task: "video-place-candidate-extract",
  });

  try {
    return parseChunkResult(raw);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[simple-video-extraction] Failed to parse chunk ${input.chunkIndex}.`, error);
    }
    return { places: [], foods: [] };
  }
}

export function resolveSimpleExtractionModel(explicitModel?: string): string {
  return resolveModelForTask("video-place-candidate-extract", explicitModel || serverConfig.ollamaLocationModel);
}
