import "@/server/bootstrap/videoPipelineBootstrap";
import { extractYouTubeVideoId } from "@/server/providers/youtubeProvider";
import { getMockVideoSummaryResult } from "@/lib/mocks/videoSummaryResultFixture";
import { summarizeVideo } from "@/server/services/videoSummaryService";
import type { VideoSummaryResult } from "@/types";

type SummarizeBody = {
  url?: string;
  videoId?: string;
  title?: string;
  destination?: string;
  refresh?: boolean;
};

function resolveVideoId(body: SummarizeBody): string {
  const fromField = body.videoId?.trim();
  if (fromField) {
    return fromField;
  }
  const fromUrl = extractYouTubeVideoId(body.url || "") || "";
  return fromUrl;
}

/**
 * Single entry for `/api/videos/summarize`: real pipeline or deterministic mock.
 * Set `AIYO_VIDEO_SUMMARY_MOCK=1` for offline UI / connector tests without Ollama/YouTube.
 */
export async function summarizeVideoForApi(body: SummarizeBody): Promise<VideoSummaryResult> {
  if (process.env.AIYO_VIDEO_SUMMARY_MOCK === "1") {
    return getMockVideoSummaryResult(resolveVideoId(body));
  }
  return summarizeVideo(body);
}
