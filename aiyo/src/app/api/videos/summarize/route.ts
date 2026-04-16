import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { extractYouTubeVideoId } from "@/server/providers/youtubeProvider";
import { summarizeVideo } from "@/server/services/videoSummaryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url?: string;
      videoId?: string;
      title?: string;
      destination?: string;
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

    try {
      const result = await summarizeVideo(body);
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
