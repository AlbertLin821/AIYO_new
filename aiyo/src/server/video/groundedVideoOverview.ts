import type { VideoSummarySegment } from "@/types";

const PROMOTIONAL = /訂閱|订阅|按讚|点赞|小鈴鐺|小铃铛|抽獎|抽奖|折扣碼|优惠码|優惠碼|工商|業配|业配|贊助|赞助|合作邀約|合作邀约|subscribe|sponsor|affiliate|discount code|follow me|patreon/i;

function cleanExcerpt(value: string, limit: number): string {
  const cleaned = value
    .split(/\r?\n/)
    .filter((line) => !PROMOTIONAL.test(line))
    .map((line) => line.replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/#[^\s#]+/g, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(cleaned);
  return characters.length > limit ? `${characters.slice(0, limit).join("")}…` : cleaned;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const name = cleanExcerpt(value, 50);
    const key = name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [name];
  }).slice(0, 8);
}

function verifiedStart(segment: VideoSummarySegment): number | null {
  return segment.timestampSource === "youtube-transcript" &&
    segment.timestampConfidence === "high" &&
    typeof segment.startSeconds === "number" &&
    Number.isFinite(segment.startSeconds) && segment.startSeconds >= 0
    ? Math.floor(segment.startSeconds)
    : null;
}

function clock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

/** Extractive overview: copies source excerpts; never invents travel advice or timing. */
export function buildGroundedVideoOverview(input: {
  segments: VideoSummarySegment[];
  places: string[];
  foods: string[];
  description?: string;
  transcriptAvailable: boolean;
}): string {
  const paragraphs: string[] = [];
  const places = uniqueNames(input.places);
  const foods = uniqueNames(input.foods);
  const seen = new Set<string>();
  const highlights = input.transcriptAvailable
    ? [...input.segments]
      .filter((segment) => segment.timestampSource !== "description-fallback")
      .sort((a, b) => (verifiedStart(a) ?? Infinity) - (verifiedStart(b) ?? Infinity))
      .flatMap((segment) => {
        const text = cleanExcerpt(segment.text, 160);
        const key = text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
        if (!text || seen.has(key)) return [];
        seen.add(key);
        const start = verifiedStart(segment);
        return [`${start === null ? "" : `[${clock(start)}] `}${text}`];
      }).slice(0, 6)
    : [];

  if (highlights.length) {
    paragraphs.push(`字幕內容重點：\n${highlights.map((text) => `• ${text}`).join("\n")}`);
  } else if (input.description?.trim()) {
    // Description chapter labels cannot establish caption evidence or playable segments.
    const description = cleanExcerpt(input.description, 360)
      .replace(/\b\d{1,3}:\d{2}(?::\d{2})?\b/g, "")
      .replace(/\s+/g, " ").trim();
    if (description) paragraphs.push(`影片說明摘要（來源：影片描述，未以字幕驗證）：${description}`);
  }

  const sourceLabel = input.transcriptAvailable ? "擷取內容提及" : "影片描述擷取內容提及";
  if (places.length) paragraphs.push(`${sourceLabel}的地點：${places.join("、")}。`);
  if (foods.length) paragraphs.push(`${sourceLabel}的飲食：${foods.join("、")}。`);
  if (!input.transcriptAvailable) paragraphs.push("目前沒有可用字幕；以上僅整理影片描述，不提供片段時間定位。");
  if (!paragraphs.length) return "目前沒有足夠的影片內容可整理摘要。";
  const overview = paragraphs.join("\n\n");
  return Array.from(overview).length > 2000 ? `${Array.from(overview).slice(0, 1999).join("")}…` : overview;
}
