"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Sparkles, TrendingUp } from "lucide-react";
import VideoCard from "@/components/home/VideoCard";
import VideoSearchBar from "@/components/home/VideoSearchBar";
import { getDefaultTaiwanCityVideos } from "@/data/defaultTaiwanCityVideos";
import { readPendingVideoImport } from "@/lib/pendingVideoImport";
import { zhTW as t } from "@/locales/zh-TW";
import { fetchVideoRecommendations, shouldSkipClientVideoSummarize, summarizeVideo } from "@/services/videoClient";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useVideoStore } from "@/stores/useVideoStore";
import type { VideoRecommendation } from "@/types";

const VideoSummaryDrawer = dynamic(() => import("@/components/home/VideoSummaryDrawer"), {
  ssr: false,
});

export default function HomePage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const resumeImportHandledRef = useRef(false);
  const videoSearchInputRef = useRef<HTMLInputElement | null>(null);
  const {
    videos,
    selectedVideo,
    setSelectedVideo,
    errorMessage,
    recommendationSource,
    setSummaryDiagnostics,
    searchQuery,
    upsertVideo,
    setIsSummarizing,
    setVideos,
    setRecommendationSource,
    setIsSearching,
    setErrorMessage,
    setSearchQuery,
    bumpSearchBarReset,
  } = useVideoStore();
  const tripDestination = useTripStore((state) => state.destination);
  const tripDays = useTripStore((state) => state.days);
  const pushToast = useToastStore((state) => state.pushToast);

  const hasSearched = Boolean(searchQuery.trim());
  const hasTripSeed = Boolean(tripDestination.trim()) && tripDays > 0;
  const showEmptyGrid = videos.length === 0 && !errorMessage;
  const defaultVideos = useMemo(() => getDefaultTaiwanCityVideos(6), []);

  useEffect(() => {
    if (!hasSearched && !hasTripSeed && videos.length === 0) {
      setVideos(defaultVideos);
      setRecommendationSource("default-taiwan-cities");
    }
  }, [defaultVideos, hasSearched, hasTripSeed, setRecommendationSource, setVideos, videos.length]);

  useEffect(() => {
    if (!tripDestination.trim() || hasSearched) {
      return;
    }
    if (videos.length > 0 && recommendationSource && recommendationSource !== "default-taiwan-cities") {
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    setErrorMessage(null);
    void fetchVideoRecommendations({
      destination: tripDestination.trim(),
      days: tripDays,
      preferences: ["美食", "景點", "懶人包"],
      limit: 6,
    })
      .then((outcome) => {
        if (cancelled) {
          return;
        }
        setVideos(outcome.videos.length ? outcome.videos : defaultVideos);
        setRecommendationSource(outcome.videos.length ? outcome.source : "default-taiwan-cities");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : t.video.requestFailedGeneric);
        setVideos(defaultVideos);
        setRecommendationSource("default-taiwan-cities");
      })
      .finally(() => {
        setIsSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    defaultVideos,
    hasSearched,
    recommendationSource,
    setErrorMessage,
    setIsSearching,
    setRecommendationSource,
    setVideos,
    tripDays,
    tripDestination,
    videos.length,
  ]);

  const openVideoSummary = useCallback(async (video: VideoRecommendation) => {
    setSummaryDiagnostics(null);
    setSelectedVideo(video);

    if (shouldSkipClientVideoSummarize(video)) {
      return;
    }

    setIsSummarizing(true);
    try {
      const result = await summarizeVideo({
        videoId: video.videoId,
        title: video.title,
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
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description: error instanceof Error ? error.message : t.video.requestFailedGeneric,
      });
    } finally {
      setIsSummarizing(false);
    }
  }, [
    pushToast,
    setIsSummarizing,
    setSelectedVideo,
    setSummaryDiagnostics,
    tripDestination,
    upsertVideo,
  ]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      resumeImportHandledRef.current = false;
      return;
    }
    if (typeof window === "undefined" || resumeImportHandledRef.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("resumeVideoImport") !== "1") {
      return;
    }
    resumeImportHandledRef.current = true;
    const pending = readPendingVideoImport();
    router.replace("/", { scroll: false });
    if (!pending?.videoId) {
      return;
    }
    void (async () => {
      const fromList = useVideoStore.getState().videos.find((v) => v.videoId === pending.videoId);
      if (fromList) {
        await openVideoSummary(fromList);
        return;
      }
      setSummaryDiagnostics(null);
      setSelectedVideo(null);
      setIsSummarizing(true);
      try {
        const result = await summarizeVideo({
          videoId: pending.videoId,
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
      } catch (error) {
        pushToast({
          variant: "error",
          title: t.video.requestFailed,
          description: error instanceof Error ? error.message : t.video.requestFailedGeneric,
        });
      } finally {
        setIsSummarizing(false);
      }
    })();
  }, [
    openVideoSummary,
    pushToast,
    router,
    sessionStatus,
    setIsSummarizing,
    setSelectedVideo,
    setSummaryDiagnostics,
    tripDestination,
    upsertVideo,
  ]);

  const handleCloseVideoDrawer = useCallback(() => {
    setSelectedVideo(null);
    setSearchQuery("");
    bumpSearchBarReset();
  }, [bumpSearchBarReset, setSearchQuery, setSelectedVideo]);

  const focusVideoSearch = useCallback(() => {
    const el = videoSearchInputRef.current;
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      el.focus({ preventScroll: true });
    }, 200);
  }, []);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <button
          type="button"
          onClick={focusVideoSearch}
          className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium mb-4 cursor-pointer transition-opacity hover:opacity-90"
          aria-label={t.home.badgeFocusSearch}
        >
          <Sparkles className="size-3" aria-hidden />
          {t.home.badge}
        </button>
        <h1 className="text-3xl font-bold text-foreground mb-2">{t.home.title}</h1>
        <p className="text-muted text-sm max-w-2xl mx-auto">{t.home.subtitle}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-10"
      >
        <VideoSearchBar ref={videoSearchInputRef} />
      </motion.div>

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <TrendingUp className="size-4 text-secondary" />
          <h2 className="font-semibold text-foreground">{t.home.recommended}</h2>
          <span className="text-xs text-muted bg-border-light px-2 py-0.5 rounded-full">
            {videos.length} {t.home.items}
          </span>
          {recommendationSource === "youtube-data-api" && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-tertiary/15 px-2 py-0.5 text-foreground/80">
              {t.home.sourceYoutube}
            </span>
          )}
          {recommendationSource === "default-taiwan-cities" && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-primary/15 px-2 py-0.5 text-foreground/80">
              {t.home.sourceDefault}
            </span>
          )}
          {recommendationSource === "mock-fallback" && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-secondary/15 px-2 py-0.5 text-foreground/80">
              {t.home.sourceFallback}
            </span>
          )}
          {recommendationSource === "single-video-url" && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-lavender/20 px-2 py-0.5 text-foreground/80">
              {t.home.sourceSingleVideo}
            </span>
          )}
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        )}

        {showEmptyGrid ? (
          <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-6 py-16 text-center">
            <p className="text-base font-medium text-foreground">
              {hasSearched ? t.home.noApiResults : t.home.emptyTitle}
            </p>
            <p className="mt-2 text-sm text-muted">{t.home.emptyHint}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {videos.map((video, index) => (
              <VideoCard
                key={video.id}
                video={video}
                index={index}
                onClick={() => void openVideoSummary(video)}
              />
            ))}
          </div>
        )}
      </div>

      <VideoSummaryDrawer
        video={selectedVideo}
        open={selectedVideo !== null}
        onClose={handleCloseVideoDrawer}
      />
    </div>
  );
}
