"use client";

import { useState } from "react";
import { Link2, Loader2, Search } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { useTripStore } from "@/stores/useTripStore";
import { useToastStore } from "@/stores/useToastStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { fetchVideoRecommendations, summarizeVideo } from "@/services/videoClient";

export default function VideoSearchBar() {
  const [input, setInput] = useState("");
  const tripDestination = useTripStore((state) => state.destination);
  const pushToast = useToastStore((state) => state.pushToast);
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
    setSummaryDiagnostics,
  } = useVideoStore();

  const trimmed = input.trim();
  const isUrl =
    trimmed.startsWith("http") ||
    trimmed.startsWith("www") ||
    trimmed.includes("youtube.com") ||
    trimmed.includes("youtu.be");

  async function handleSearch() {
    if (!trimmed) {
      return;
    }

    setErrorMessage(null);
    setSearchQuery(trimmed);

    try {
      if (isUrl) {
        setIsSummarizing(true);
        const result = await summarizeVideo({
          url: trimmed,
          destination: tripDestination,
        });
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
      } else {
        setIsSearching(true);
        setSummaryDiagnostics(null);
        const outcome = await fetchVideoRecommendations({
          keyword: trimmed,
          limit: 10,
        });
        setVideos(outcome.videos);
        setRecommendationSource(outcome.source);
        if (outcome.source === "mock-fallback") {
          pushToast({
            variant: "warning",
            title: t.video.mockVideosTitle,
            description: outcome.fallbackReason || t.video.mockVideosDesc,
          });
        }
      }
    } catch (error) {
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

  const isBusy = isSearching || isSummarizing;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
            {isUrl ? <Link2 className="size-4" /> : <Search className="size-4" />}
          </div>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void handleSearch()}
            placeholder={t.video.searchPlaceholder}
            data-testid="video-search-input"
            className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-border bg-surface text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all text-sm shadow-soft"
          />
        </div>
        <button
          onClick={() => void handleSearch()}
          disabled={isBusy || !trimmed}
          data-testid="video-search-button"
          className="px-5 py-3.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-2xl font-medium text-sm hover:shadow-md transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
        >
          {isBusy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {isUrl ? t.video.summarizing : t.video.searching}
            </>
          ) : isUrl ? (
            t.video.summarize
          ) : (
            t.video.search
          )}
        </button>
      </div>
      <p className="text-xs text-muted mt-2 text-center">{t.video.searchHelper}</p>
    </div>
  );
}
