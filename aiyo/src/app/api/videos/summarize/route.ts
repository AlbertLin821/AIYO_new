import { submitVideoJob } from "@/server/jobs/videoJobs";
import "@/server/bootstrap/videoPipelineBootstrap";
import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { extractYouTubeVideoId } from "@/server/providers/youtubeProvider";
import { recordVideoInteraction } from "@/server/personalization/personalizationService";
import { summarizeVideoForApi } from "@/server/services/videoSummaryConnector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summarizeErrorMeta(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as {
      url?: string;
      videoId?: string;
      title?: string;
      destination?: string;
      refresh?: boolean;
    };

    if (!body.url?.trim() && !body.videoId?.trim()) {
      return NextResponse.json(
        createError("invalid_request", "Provide `url` or `videoId`."),
        { status: 400 },
      );
    }

    if (body.url?.trim()) {
      const id = extractYouTubeVideoId(body.url.trim());
      if (!id) {
        return NextResponse.json(
          createError("invalid_url", "Could not parse a YouTube video id from the URL."),
          { status: 400 },
        );
      }
    }

    const resolvedVideoId = body.videoId?.trim() || extractYouTubeVideoId(body.url || "");
    if (!resolvedVideoId || !/^[a-zA-Z0-9_-]{11}$/.test(resolvedVideoId)) {
      return NextResponse.json(createError("invalid_request", "影片識別碼格式不正確。"), { status: 400 });
    }
    if (request.headers.get("Prefer")?.includes("respond-async")) {
      try {
        const job = await submitVideoJob(userId, { videoId: resolvedVideoId, title: body.title?.slice(0, 300), destination: body.destination?.slice(0, 200), refresh: body.refresh === true });
        return NextResponse.json(createSuccess(job), { status: 202 });
      } catch {
        return NextResponse.json(createError("queue_unavailable", "分析服務暫時無法使用，請稍後重試。"), { status: 503 });
      }
    }
    try {
      const result = await summarizeVideoForApi(body);
      await recordVideoInteraction(userId, {
        videoId: result.video.videoId || body.videoId || "",
        videoUrl: result.video.url || body.url,
        title: result.video.title || body.title,
        interactionType: "analyze",
        summaryId: result.video.videoId,
        extractedPlaces: result.video.extractedLocations.map((location) => location.name),
        extractedTimestamps: result.video.summarySegments?.map((segment) => ({
          timestamp: segment.timestamp,
          title: segment.title,
        })),
        metadata: {
          cacheStatus: result.debug?.cacheStatus,
          summarySource: result.summarySource,
          segmentSource: result.segmentSource,
        },
      }).catch(() => undefined);
      return NextResponse.json(createSuccess(result));
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_VIDEO_REFERENCE") {
        return NextResponse.json(
          createError("invalid_request", "Provide a valid YouTube `url` or `videoId`."),
          { status: 400 },
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    console.error("[video-summarize] Failed to summarize video.", summarizeErrorMeta(error));
    return NextResponse.json(
      createError(
        "internal_error",
        "Failed to summarize the video.",
        error instanceof Error ? error.message : undefined,
      ),
      { status: 500 },
    );
  }
}
