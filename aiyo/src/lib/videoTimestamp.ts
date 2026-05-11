import type { VideoSummarySegment } from "@/types";

export function parseTimestampToSeconds(timestamp?: string): number {
  if (!timestamp) {
    return 0;
  }
  const trimmed = timestamp.trim();
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    return 0;
  }
  const parts = trimmed
    .split(":")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

type SegmentSeekInput = Pick<
  VideoSummarySegment,
  "startSeconds" | "timestamp" | "startLabel" | "timestampConfidence"
>;

/** 回傳可安全 seek 的秒數；無法從片段推導時回傳 null（按鈕應停用）。 */
export function getSegmentSeekSeconds(segment: SegmentSeekInput): number | null {
  if (typeof segment.startSeconds === "number" && Number.isFinite(segment.startSeconds) && segment.startSeconds >= 0) {
    return Math.floor(segment.startSeconds);
  }
  const label = segment.startLabel || segment.timestamp;
  if (!label?.trim()) {
    return null;
  }
  if (segment.timestampConfidence === "low" && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(label.trim())) {
    return null;
  }
  const parsed = parseTimestampToSeconds(label);
  return parsed > 0 ? parsed : null;
}
