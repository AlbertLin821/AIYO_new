import type { ChatSource } from "@/types";
import type { SourceReference, SourceType } from "@/lib/types/sources";
import { parseYoutubeTimeFromUrl } from "@/lib/youtubeWatchUrl";

function mapChatSourceType(type: ChatSource["type"]): SourceType {
  switch (type) {
    case "youtube":
      return "youtube";
    case "web":
      return "website";
    case "official":
      return "website";
    case "weather":
      return "system";
    default:
      return "unknown";
  }
}

/**
 * 將既有的 ChatSource（LLM / Tavily 正規化）轉成 Grounded `SourceReference`，供 SourceBadge / Drawer 共用。
 */
export function chatSourceToSourceReference(cs: ChatSource): SourceReference {
  const base: SourceReference = {
    id: cs.source_id,
    type: mapChatSourceType(cs.type),
    title: cs.title?.trim() || "未命名來源",
    url: cs.url?.trim() || undefined,
    snippet: cs.snippet?.trim() || cs.preview_text?.trim() || undefined,
    thumbnailUrl: cs.thumbnail?.trim() || undefined,
    provider: cs.provider,
    retrievedAt: cs.retrieved_at,
    confidence: cs.reliability === "high" ? 0.9 : cs.reliability === "medium" ? 0.6 : 0.35,
  };

  if (cs.type === "youtube") {
    const videoId = extractYoutubeId(cs.url);
    const { startSeconds } = parseYoutubeTimeFromUrl(cs.url?.trim() || "");
    base.youtube = {
      videoId: videoId || "unknown",
      channelTitle: undefined,
      ...(startSeconds !== undefined ? { startSeconds } : {}),
    };
  } else if (cs.type === "web" || cs.type === "official") {
    base.website = {
      siteName: cs.domain,
      canonicalUrl: cs.url,
    };
  }

  return base;
}

function extractYoutubeId(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace(/^\//, "").slice(0, 32) || undefined;
    }
    const v = u.searchParams.get("v");
    if (v) {
      return v;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function chatSourcesRecordToReferences(
  citations: string[] | undefined,
  sources: Record<string, ChatSource> | undefined,
): SourceReference[] {
  if (!citations?.length || !sources) {
    return [];
  }
  const out: SourceReference[] = [];
  const seen = new Set<string>();
  for (const id of citations) {
    const cs = sources[id];
    if (!cs || seen.has(cs.source_id)) {
      continue;
    }
    seen.add(cs.source_id);
    out.push(chatSourceToSourceReference(cs));
  }
  return out;
}
