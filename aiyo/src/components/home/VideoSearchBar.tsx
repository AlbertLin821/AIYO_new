"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  failFrontendDebugProcess,
  finishFrontendDebugProcess,
  startFrontendDebugProcess,
  updateFrontendDebugProcess,
} from "@/lib/frontendDebug";
import { enqueueVideoSummaries } from "@/lib/videoSummaryQueue";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import { useTripStore } from "@/stores/useTripStore";
import { useToastStore } from "@/stores/useToastStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { fetchVideoRecommendations, summarizeVideo } from "@/services/videoClient";

export type VideoSearchBarMode = "video" | "itinerary";

type VideoSearchBarProps = {
  mode?: VideoSearchBarMode;
  onItinerarySearch?: (query: string) => void;
  isItinerarySearching?: boolean;
};

const VideoSearchBar = forwardRef<HTMLInputElement, VideoSearchBarProps>(function VideoSearchBar(
  { mode = "video", onItinerarySearch, isItinerarySearching = false },
  ref,
) {
  const [input, setInput] = useState("");
  const innerRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLInputElement, []);

  const tripDestination = useTripStore((state) => state.destination);
  const pushToast = useToastStore((state) => state.pushToast);
  const searchBarResetNonce = useVideoStore((state) => state.searchBarResetNonce);
  const {
    isSearching,
    isSummarizing,
    setIsSearching,
    setIsSummarizing,
    setVideos,
    upsertVideo,
    setSelectedVideo,
    setErrorMessage,
    setSearchQuery,
    setRecommendationSource,
    setLastRecommendationRequest,
    setSummaryDiagnostics,
  } = useVideoStore();

  useEffect(() => {
    if (searchBarResetNonce > 0) {
      setInput("");
    }
  }, [searchBarResetNonce]);

  const trimmed = input.trim();
  const isUrl =
    trimmed.startsWith("http") ||
    trimmed.startsWith("www") ||
    trimmed.includes("youtube.com") ||
    trimmed.includes("youtu.be");

  async function handleSearch() {
    if (mode === "itinerary") {
      onItinerarySearch?.(trimmed);
      return;
    }

    if (!trimmed) {
      return;
    }

    const processId = startFrontendDebugProcess("video-search-ui", "手動搜尋影片或摘要單支影片", {
      query: trimmed,
      isUrl,
      tripDestination,
    });

    setErrorMessage(null);
    setSearchQuery(trimmed);

    try {
      if (isUrl) {
        setIsSummarizing(true);
        updateFrontendDebugProcess(processId, "single-video-summary-start", {
          url: trimmed,
        });
        const result = await summarizeVideo({
          url: trimmed,
          destination: tripDestination,
        });
        setVideos([result.video]);
        setRecommendationSource("single-video-url");
        upsertVideo(result.video);
        setSelectedVideo(result.video);
        setSummaryDiagnostics({
          transcriptSource: result.transcriptSource,
          summarySource: result.summarySource,
          segmentSource: result.segmentSource,
          captionLanguage: result.debug?.captionLanguage,
          captionKind: result.debug?.captionKind,
          captionSource: result.debug?.captionSource,
          mapsProvenance: result.mapsProvenance,
          geocodeWarnings: result.geocodeWarnings,
          summaryUnavailable: result.summaryUnavailable,
          unavailableReason: result.unavailableReason,
        });
        if (result.summaryUnavailable) {
          pushToast({
            variant: "info",
            title: t.video.summaryUnavailableTitle,
            description: result.unavailableReason || t.video.summaryUnavailableDesc,
          });
        }
        if (result.mapsProvenance === "catalog-fallback") {
          pushToast({
            variant: "warning",
            title: t.video.mapCoordsTitle,
            description: result.geocodeWarnings?.[0] || t.video.mapCoordsDesc,
          });
        }
        if (result.mapsProvenance === "mixed") {
          pushToast({
            variant: "warning",
            title: t.video.mapCoordsTitle,
            description: t.video.mapsMixed,
          });
        }
        finishFrontendDebugProcess(processId, {
          mode: "single-video-summary",
          videoId: result.video.videoId,
          title: result.video.title,
        });
      } else {
        setIsSearching(true);
        setSummaryDiagnostics(null);
        updateFrontendDebugProcess(processId, "search-recommendations-start", {
          keyword: trimmed,
        });
        const request = {
          keyword: trimmed,
          limit: 6,
        };
        const outcome = await fetchVideoRecommendations(request);
        setVideos(outcome.videos);
        setRecommendationSource(outcome.source);
        setLastRecommendationRequest(request);
        enqueueVideoSummaries(outcome.videos, {
          destination: tripDestination,
        });
        if (outcome.source === "mock-fallback") {
          pushToast({
            variant: "warning",
            title: t.video.mockVideosTitle,
            description: outcome.fallbackReason || t.video.mockVideosDesc,
          });
        }
        finishFrontendDebugProcess(processId, {
          mode: "recommendation-search",
          resultCount: outcome.videos.length,
          source: outcome.source,
        });
      }
    } catch (error) {
      failFrontendDebugProcess(processId, error, {
        query: trimmed,
        isUrl,
      });
      const description =
        error instanceof Error ? error.message : t.video.requestFailedGeneric;
      setErrorMessage(description);
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description,
        actionLabel: t.common.retry,
        action: () => void handleSearch(),
      });
    } finally {
      setIsSearching(false);
      setIsSummarizing(false);
    }
  }

  const isBusy = mode === "itinerary" ? isItinerarySearching : isSearching || isSummarizing;
  const placeholder =
    mode === "itinerary" ? t.home.itinerarySearchPlaceholder : "搜尋";
  const submitAria = mode === "itinerary" ? t.home.recommendedItineraries : isUrl ? t.video.summarize : t.video.search;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        className={cn(
          "flex min-h-[50px] items-stretch overflow-hidden rounded-full border border-border bg-surface shadow-soft transition-colors",
          "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/25",
        )}
      >
        <Input
          ref={innerRef}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void handleSearch()}
          data-testid="video-search-input"
          placeholder={placeholder}
          className="h-auto min-h-[50px] flex-1 rounded-none border-0 bg-transparent px-5 py-2.5 text-base font-medium shadow-none ring-0 focus-visible:ring-0 sm:px-6"
        />
        <Button
          type="button"
          onClick={() => void handleSearch()}
          disabled={isBusy || !trimmed}
          aria-label={submitAria}
          data-testid="video-search-submit"
          className="h-auto min-h-[50px] w-16 shrink-0 rounded-none rounded-r-full border-0 border-l border-border bg-primary px-0 text-white hover:bg-primary-dark sm:w-18"
        >
          {isBusy ? (
            <Loader2 className="size-6 animate-spin" aria-hidden />
          ) : (
            <Search className="size-6" strokeWidth={2.25} aria-hidden />
          )}
        </Button>
      </div>
    </div>
  );
});

VideoSearchBar.displayName = "VideoSearchBar";

export default VideoSearchBar;
