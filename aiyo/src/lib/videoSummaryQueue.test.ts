import assert from "node:assert/strict";
import test from "node:test";
import { createSuccess } from "@/lib/api-response";
import { enqueueVideoSummary } from "@/lib/videoSummaryQueue";
import { useVideoStore } from "@/stores/useVideoStore";
import type { VideoRecommendation, VideoSummaryResult } from "@/types";

function waitForMicrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function baseVideo(
  id: string,
  overrides: Partial<VideoRecommendation> = {},
): VideoRecommendation {
  return {
    id,
    videoId: id,
    title: `Video ${id}`,
    thumbnail: `https://example.com/${id}.jpg`,
    url: `https://youtu.be/${id}`,
    duration: "10:00",
    summary: "Existing processed summary",
    description: "",
    source: "youtube-data-api",
    timestamps: [],
    extractedLocations: [
      {
        name: `Place ${id}`,
        description: "",
        lat: 25,
        lng: 121,
        confidence: 0.9,
        verified: true,
      },
    ],
    summarySegments: [
      {
        id: `${id}-segment`,
        timestamp: "0:00",
        text: "segment",
        startSeconds: 0,
        endSeconds: 10,
      },
    ],
    ...overrides,
  };
}

function buildResult(video: VideoRecommendation): VideoSummaryResult {
  return {
    source: "youtube-summary-service",
    transcriptSource: "youtube",
    summarySource: "ollama-transcript",
    segmentSource: "transcript-chunks",
    title: video.title,
    summary: `Fresh summary for ${video.videoId}`,
    segments: video.summarySegments ?? [],
    extractedLocations: video.extractedLocations.map((location) => location.name),
    extractedFoods: ["noodles"],
    mapsProvenance: "google-geocoding",
    video: {
      ...video,
      summary: `Fresh summary for ${video.videoId}`,
      extractedFoods: ["noodles"],
    },
    debug: {
      transcriptSource: "youtube",
      summarySource: "ollama-transcript",
      segmentSource: "transcript-chunks",
      cacheStatus: "miss",
    },
  };
}

test("enqueueVideoSummary keeps statuses per video and refresh requests run in sequence", async (t) => {
  const originalFetch = globalThis.fetch;
  const first = deferredResponse();
  const second = deferredResponse();
  const requests: Array<{ refresh?: boolean; videoId?: string }> = [];

  useVideoStore.setState({
    videos: [],
    selectedVideo: null,
    summaryDiagnostics: null,
    summaryDiagnosticsByVideoKey: {},
    summaryStatusByVideoKey: {},
    isSummarizing: false,
  });

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as { refresh?: boolean; videoId?: string } : {};
    requests.push(body);
    if (requests.length === 1) {
      return first.promise;
    }
    return second.promise;
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    useVideoStore.setState({
      summaryDiagnostics: null,
      summaryDiagnosticsByVideoKey: {},
      summaryStatusByVideoKey: {},
      selectedVideo: null,
      videos: [],
    });
  });

  const videoA = baseVideo("video-a");
  const videoB = baseVideo("video-b");

  const jobA = enqueueVideoSummary(videoA, {
    destination: "Tokyo",
    background: false,
    refresh: true,
  });
  assert.ok(jobA);

  await waitForMicrotask();
  assert.equal(useVideoStore.getState().getVideoSummaryStatus("video-a"), "running");

  const jobB = enqueueVideoSummary(videoB, {
    destination: "Osaka",
    background: false,
    refresh: true,
  });
  assert.ok(jobB);

  await waitForMicrotask();
  assert.equal(useVideoStore.getState().getVideoSummaryStatus("video-b"), "queued");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.refresh, true);
  assert.equal(requests[0]?.videoId, "video-a");

  first.resolve(
    new Response(JSON.stringify(createSuccess(buildResult(videoA))), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  await jobA;
  await waitForMicrotask();

  assert.equal(requests.length, 2);
  assert.equal(requests[1]?.refresh, true);
  assert.equal(requests[1]?.videoId, "video-b");
  assert.equal(useVideoStore.getState().getVideoSummaryStatus("video-a"), null);
  assert.equal(useVideoStore.getState().getVideoSummaryStatus("video-b"), "running");

  second.resolve(
    new Response(JSON.stringify(createSuccess(buildResult(videoB))), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  await jobB;
  await waitForMicrotask();

  assert.equal(useVideoStore.getState().getVideoSummaryStatus("video-b"), null);
  assert.equal(
    useVideoStore.getState().getSummaryDiagnosticsForVideo("video-a")?.summarySource,
    "ollama-transcript",
  );
  assert.equal(
    useVideoStore.getState().getSummaryDiagnosticsForVideo("video-b")?.summarySource,
    "ollama-transcript",
  );
});
