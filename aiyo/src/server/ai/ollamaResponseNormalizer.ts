const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/g;
const SIMPLIFIED_TO_TRADITIONAL_PHRASES: Array<[RegExp, string]> = [
  [/这个/g, "這個"],
  [/适合/g, "適合"],
  [/第一次/g, "第一次"],
  [/来/g, "來"],
  [/台湾/g, "台灣"],
  [/旅客/g, "旅客"],
  [/推荐/g, "推薦"],
  [/景点/g, "景點"],
  [/热门/g, "熱門"],
  [/请参考/g, "請參考"],
  [/请使用/g, "請使用"],
  [/请/g, "請"],
  [/链接/g, "連結"],
  [/视频/g, "影片"],
  [/信息/g, "資訊"],
  [/软件/g, "軟體"],
  [/链结/g, "連結"],
];
const TAIWAN_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/鏈接/g, "連結"],
  [/視頻/g, "影片"],
  [/信息/g, "資訊"],
  [/軟件/g, "軟體"],
];

function protectSegments(input: string, pattern: RegExp, bag: string[], marker: string): string {
  return input.replace(pattern, (matched) => {
    const index = bag.push(matched) - 1;
    return `__${marker}_${index}__`;
  });
}

function restoreSegments(input: string, bag: string[], marker: string): string {
  return input.replace(new RegExp(`__${marker}_(\\d+)__`, "g"), (_, rawIndex: string) => {
    const index = Number(rawIndex);
    return Number.isInteger(index) && bag[index] !== undefined ? bag[index] : _;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringValue(input: string): string {
  const codeBlocks: string[] = [];
  const urls: string[] = [];

  let protectedText = protectSegments(input, CODE_BLOCK_RE, codeBlocks, "CODE_BLOCK");
  protectedText = protectSegments(protectedText, URL_RE, urls, "URL");
  let converted = protectedText;
  for (const [pattern, replacement] of SIMPLIFIED_TO_TRADITIONAL_PHRASES) {
    converted = converted.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of TAIWAN_TERM_REPLACEMENTS) {
    converted = converted.replace(pattern, replacement);
  }
  const restoredUrls = restoreSegments(converted, urls, "URL");
  return restoreSegments(restoredUrls, codeBlocks, "CODE_BLOCK");
}

function deepNormalizeJsonValues(value: unknown): unknown {
  if (typeof value === "string") {
    return normalizeStringValue(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepNormalizeJsonValues(item));
  }
  if (isPlainObject(value)) {
    const normalizedEntries = Object.entries(value).map(([key, itemValue]) => [
      key,
      deepNormalizeJsonValues(itemValue),
    ]);
    return Object.fromEntries(normalizedEntries);
  }
  return value;
}

function extractJsonCandidate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed;
  }

  return null;
}

export function normalizeOllamaPlainText(input: string): string {
  return normalizeStringValue(input);
}

export function normalizeOllamaJsonContent(input: string): string {
  const candidate = extractJsonCandidate(input);
  if (!candidate) {
    return input;
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const normalized = deepNormalizeJsonValues(parsed);
    return JSON.stringify(normalized);
  } catch {
    return input;
  }
}

export function normalizeOllamaResponseContent(input: string, format?: "json" | Record<string, unknown>): string {
  if (format === "json" || (format && typeof format === "object")) {
    return normalizeOllamaJsonContent(input);
  }
  return normalizeOllamaPlainText(input);
}
