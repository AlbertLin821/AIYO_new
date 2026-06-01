"use client";

import { m } from "@/lib/motion";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import HomeHeroBanner from "@/components/home/HomeHeroBanner";
import HomePartnerAdsSection from "@/components/home/HomePartnerAdsSection";
import HomeRecommendationsSection, {
  type HomeRecommendPanel,
} from "@/components/home/HomeRecommendationsSection";
import HomeTravelArticlesSection from "@/components/home/HomeTravelArticlesSection";
import PlanningWaitGame from "@/components/chat/PlanningWaitGame";
import VideoSearchBar from "@/components/home/VideoSearchBar";
import { getDefaultTaiwanCityVideos } from "@/data/defaultTaiwanCityVideos";
import { INITIAL_VIDEO_RECOMMENDATIONS_LIMIT } from "@/lib/videoListLimits";
import {
  failFrontendDebugProcess,
  finishFrontendDebugProcess,
  logFrontendDebugEvent,
  startFrontendDebugProcess,
  updateFrontendDebugProcess,
} from "@/lib/frontendDebug";
import { mergeVideosWithStoredSummaries } from "@/lib/mergeVideoSummaries";
import { fetchRecommendationsWithClientCache } from "@/lib/fetchRecommendationsWithClientCache";
import { buildRecommendationQueryKey } from "@/lib/videoRecommendationCache";
import { readPendingVideoImport } from "@/lib/pendingVideoImport";
import {
  collectVideoIdentityIds,
  fetchReplacementVideo,
  type VideoRecommendationRequest,
} from "@/lib/replaceDismissedVideo";
import { enqueueVideoSummaries, enqueueVideoSummary } from "@/lib/videoSummaryQueue";
import { zhTW as t } from "@/locales/zh-TW";
import {
  fetchVideoRecommendations,
  recordVideoWatch,
  shouldSkipClientVideoSummarize,
  summarizeVideo,
} from "@/services/videoClient";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useVideoStore, type VideoState } from "@/stores/useVideoStore";
import type { VideoRecommendation } from "@/types";

const VideoSummaryDrawer = dynamic(() => import("@/components/home/VideoSummaryDrawer"), {
  ssr: false,
});

const HOME_RECOMMEND_PANEL_KEY = "aiyo:home-recommend-panel";

function readStoredRecommendPanel(): HomeRecommendPanel {
  if (typeof window === "undefined") {
    return "videos";
  }
  try {
    const stored = window.localStorage.getItem(HOME_RECOMMEND_PANEL_KEY);
    return stored === "itineraries" ? "itineraries" : "videos";
  } catch {
    return "videos";
  }
}

const AD_PREVIEWS = [
  {
    id: "ad-1",
    brand: "TravelGo",
    partner: "LINE Bank",
    title: "日韓泰 機票飯店 85 折起",
    description: "機票、飯店、機加酒專屬優惠",
    cta: "每週三優惠",
    bg: "linear-gradient(135deg, #e8f5e9 0%, #a5d6a7 100%)",
    titleColor: "#1b5e20",
    descColor: "#2e7d32",
    btnBg: "#ff5722",
    btnColor: "#fff",
  },
  {
    id: "ad-2",
    brand: "GoAsia",
    partner: null,
    title: "深度旅遊 搶飯店優惠 $300",
    description: "訂機票、飯店拿 500 獎勵金",
    cta: "立即預訂",
    bg: "linear-gradient(135deg, #e3f2fd 0%, #90caf9 100%)",
    titleColor: "#0d47a1",
    descColor: "#1565c0",
    btnBg: "#d32f2f",
    btnColor: "#fff",
  },
  {
    id: "ad-3",
    brand: "FunTrip",
    partner: "VISA",
    title: "釜山自由行 加購行李 5 折",
    description: "每週一開搶 限量優惠",
    cta: "每週一開搶",
    bg: "linear-gradient(135deg, #fce4ec 0%, #f48fb1 100%)",
    titleColor: "#880e4f",
    descColor: "#ad1457",
    btnBg: "#6a1b9a",
    btnColor: "#fff",
  },
  {
    id: "ad-4",
    brand: "SkyPass",
    partner: "MasterCard",
    title: "東京大阪 來回機票 $4,999",
    description: "限時搶購 售完為止",
    cta: "馬上搶",
    bg: "linear-gradient(135deg, #fff3e0 0%, #ffcc80 100%)",
    titleColor: "#e65100",
    descColor: "#bf360c",
    btnBg: "#1565c0",
    btnColor: "#fff",
  },
  {
    id: "ad-5",
    brand: "StayEasy",
    partner: null,
    title: "曼谷五星飯店 買一送一",
    description: "入住含早餐、免費接駁",
    cta: "限量搶購",
    bg: "linear-gradient(135deg, #f3e5f5 0%, #ce93d8 100%)",
    titleColor: "#4a148c",
    descColor: "#6a1b9a",
    btnBg: "#00897b",
    btnColor: "#fff",
  },
  {
    id: "ad-6",
    brand: "RailEurope",
    partner: "JCB",
    title: "歐洲火車通票 75 折",
    description: "暢遊法德義瑞 無限搭乘",
    cta: "立即選購",
    bg: "linear-gradient(135deg, #e0f2f1 0%, #80cbc4 100%)",
    titleColor: "#004d40",
    descColor: "#00695c",
    btnBg: "#c62828",
    btnColor: "#fff",
  },
  {
    id: "ad-7",
    brand: "IslandHop",
    partner: null,
    title: "沖繩租車自駕 3 日 $1,200",
    description: "含全險、免費 GPS 導航",
    cta: "預約租車",
    bg: "linear-gradient(135deg, #e1f5fe 0%, #4fc3f7 100%)",
    titleColor: "#01579b",
    descColor: "#0277bd",
    btnBg: "#f57c00",
    btnColor: "#fff",
  },
  {
    id: "ad-8",
    brand: "WifiGo",
    partner: "中華電信",
    title: "出國上網 吃到飽 $99/天",
    description: "日韓東南亞 高速不降速",
    cta: "立即申辦",
    bg: "linear-gradient(135deg, #fff9c4 0%, #fff176 100%)",
    titleColor: "#f57f17",
    descColor: "#f9a825",
    btnBg: "#283593",
    btnColor: "#fff",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";
  const resumeImportHandledRef = useRef(false);
  const videoSearchInputRef = useRef<HTMLInputElement | null>(null);

  const [isLoadingMoreVideos, setIsLoadingMoreVideos] = useState(false);
  const [replacingVideoIndex, setReplacingVideoIndex] = useState<number | null>(null);
  const [recommendPanel, setRecommendPanel] = useState<HomeRecommendPanel>("videos");
  const [itinerarySearchQuery, setItinerarySearchQuery] = useState("");
  const {
    videos,
    selectedVideo,
    setSelectedVideo,
    errorMessage,
    isSearching,
    recommendationSource,
    lastRecommendationRequest,
    setSummaryDiagnostics,
    searchQuery,
    upsertVideo,
    setIsSummarizing,
    setInitialVideoList,
    appendToVideoList,
    replaceVideoAtIndex,
    setRecommendationSource,
    setLastRecommendationRequest,
    setIsSearching,
    setErrorMessage,
    setSearchQuery,
    bumpSearchBarReset,
  } = useVideoStore() as VideoState;
  const tripDestination = useTripStore((state) => state.destination);
  const tripDays = useTripStore((state) => state.days);
  const pushToast = useToastStore((state) => state.pushToast);

  const hasSearched = Boolean(searchQuery.trim());
  const hasTripSeed = Boolean(tripDestination.trim()) && tripDays > 0;
  const canLoadMoreVideos =
    recommendationSource !== "single-video-url" &&
    Boolean(lastRecommendationRequest || hasSearched || hasTripSeed);
  const showEmptyGrid = videos.length === 0 && !errorMessage;
  const defaultVideos = useMemo(() => getDefaultTaiwanCityVideos(6), []);
  const homeVideoProcessingActive = isSearching || isLoadingMoreVideos;
  const homeVideoProcessingKey = homeVideoProcessingActive
    ? `home-video-processing:${searchQuery.trim()}:${recommendationSource || "none"}`
    : null;

  useEffect(() => {
    setRecommendPanel(readStoredRecommendPanel());
  }, []);

  const handleRecommendPanelChange = useCallback((panel: HomeRecommendPanel) => {
    setRecommendPanel(panel);
    try {
      window.localStorage.setItem(HOME_RECOMMEND_PANEL_KEY, panel);
    } catch {
      /* ignore */
    }
    if (panel === "videos") {
      setItinerarySearchQuery("");
    }
  }, []);

  useEffect(() => {
    if (!hasSearched && !hasTripSeed && videos.length === 0) {
      setInitialVideoList(defaultVideos);
      setRecommendationSource("default-taiwan-cities");
    }
  }, [defaultVideos, hasSearched, hasTripSeed, setInitialVideoList, setRecommendationSource, videos.length]);

  useEffect(() => {
    if (!tripDestination.trim() || hasSearched) {
      return;
    }
    if (videos.length > 0 && recommendationSource && recommendationSource !== "default-taiwan-cities") {
      return;
    }
    let cancelled = false;
    setErrorMessage(null);
    const processId = startFrontendDebugProcess("home-video-seed", "首頁自動載入影片推薦", {
      destination: tripDestination.trim(),
      days: tripDays,
    });
    const request = {
      destination: tripDestination.trim(),
      days: tripDays,
      preferences: ["美食", "景點", "懶人包"],
      limit: 6,
    };
    const hasCachedSeed = Boolean(
      useVideoStore.getState().getCachedRecommendations(buildRecommendationQueryKey(request)),
    );
    if (!hasCachedSeed) {
      setIsSearching(true);
    }
    void fetchRecommendationsWithClientCache(request)
      .then((outcome) => {
        if (cancelled) {
          return;
        }
        const nextVideos = mergeVideosWithStoredSummaries(
          outcome.videos.length ? outcome.videos : defaultVideos,
          useVideoStore.getState().videos,
        );
        setInitialVideoList(nextVideos);
        setRecommendationSource(outcome.videos.length ? outcome.source : "default-taiwan-cities");
        setLastRecommendationRequest(outcome.videos.length ? request : null);
        enqueueVideoSummaries(nextVideos, {
          destination: tripDestination.trim(),
        });
        finishFrontendDebugProcess(processId, {
          resultCount: outcome.videos.length,
          source: outcome.source,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        failFrontendDebugProcess(processId, error, {
          destination: tripDestination.trim(),
        });
        setErrorMessage(error instanceof Error ? error.message : t.video.requestFailedGeneric);
        setInitialVideoList(defaultVideos);
        setRecommendationSource("default-taiwan-cities");
      })
      .finally(() => {
        setIsSearching(false);
      });
    return () => {
      cancelled = true;
      finishFrontendDebugProcess(processId, { cancelled: true });
    };
  }, [
    defaultVideos,
    hasSearched,
    recommendationSource,
    setErrorMessage,
    setIsSearching,
    setLastRecommendationRequest,
    setInitialVideoList,
    setRecommendationSource,
    tripDays,
    tripDestination,
    videos.length,
  ]);

  const openVideoSummary = useCallback(async (video: VideoRecommendation) => {
    setSummaryDiagnostics(null);
    setSelectedVideo(video);
    if (video.videoId?.trim()) {
      void recordVideoWatch({
        videoId: video.videoId,
        videoUrl: video.url,
        title: video.title,
        currentTripId: useTripStore.getState().tripId,
      }).catch(() => undefined);
    }
    logFrontendDebugEvent("home-video", "open-summary-click", {
      videoId: video.videoId,
      title: video.title,
      skipClientSummary: shouldSkipClientVideoSummarize(video),
    });

    if (shouldSkipClientVideoSummarize(video)) {
      return;
    }

    setIsSummarizing(true);
    try {
      const job = enqueueVideoSummary(video, {
        destination: tripDestination,
        background: false,
      });
      if (!job) {
        return;
      }
      const result = await job;
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
        fallbackReason: result.fallbackReason,
        failedChunkCount: result.debug?.failedChunkCount,
      });
      logFrontendDebugEvent("home-video", "summary-ready", {
        videoId: result.video.videoId,
        title: result.video.title,
        locations: result.video.extractedLocations.length,
        segments: result.video.summarySegments?.length || 0,
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

  const appendUniqueVideos = useCallback((incoming: VideoRecommendation[]) => {
    const seen = new Set(videos.map((video) => video.videoId || video.id));
    return incoming.filter((video) => {
      const key = video.videoId || video.id;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [videos]);

  const resolveVideoRecommendationRequest = useCallback((): VideoRecommendationRequest | null => {
    const fallbackRequest = hasSearched
      ? { keyword: searchQuery.trim(), limit: 6 }
      : hasTripSeed
        ? {
            destination: tripDestination.trim(),
            days: tripDays,
            preferences: ["美食", "景點", "懶人包"],
            limit: 6,
          }
        : null;
    const baseRequest = lastRecommendationRequest || fallbackRequest;
    if (!baseRequest) {
      return null;
    }
    return {
      destination: baseRequest.destination,
      keyword: baseRequest.keyword,
      days: baseRequest.days,
      preferences: baseRequest.preferences,
      limit: 1,
    };
  }, [
    hasSearched,
    hasTripSeed,
    lastRecommendationRequest,
    searchQuery,
    tripDays,
    tripDestination,
  ]);

  const handleDismissVideo = useCallback(
    async (video: VideoRecommendation, index: number) => {
      const dismissedId = (video.videoId || video.id || "").trim();
      if (!dismissedId || replacingVideoIndex !== null || isSearching || isLoadingMoreVideos) {
        return;
      }

      if (selectedVideo?.videoId === video.videoId || selectedVideo?.id === video.id) {
        setSelectedVideo(null);
        setSummaryDiagnostics(null);
      }

      const baseRequest = resolveVideoRecommendationRequest();

      if (!baseRequest) {
        const filtered = videos.filter((_, slotIndex) => slotIndex !== index);
        if (recommendationSource === "default-taiwan-cities") {
          const seen = new Set(
            filtered.map((item) => (item.videoId || item.id || "").trim()).filter(Boolean),
          );
          for (const candidate of getDefaultTaiwanCityVideos(12)) {
            if (filtered.length >= INITIAL_VIDEO_RECOMMENDATIONS_LIMIT) {
              break;
            }
            const key = (candidate.videoId || candidate.id || "").trim();
            if (key && !seen.has(key)) {
              seen.add(key);
              filtered.push(candidate);
            }
          }
        }
        setInitialVideoList(filtered);
        return;
      }

      setReplacingVideoIndex(index);
      setErrorMessage(null);
      const processId = startFrontendDebugProcess("video-dismiss-replace", "移除影片並補上一支推薦", {
        dismissedId,
        index,
        request: baseRequest,
      });

      try {
        const excludeVideoIds = collectVideoIdentityIds(videos, [dismissedId]);
        const replacement = await fetchReplacementVideo({
          baseRequest,
          excludeVideoIds,
          mergeFromVideos: videos,
        });

        if (replacement) {
          replaceVideoAtIndex(index, replacement);
        }

        if (replacement) {
          enqueueVideoSummaries([replacement], {
            destination: baseRequest.destination || tripDestination,
          });
          finishFrontendDebugProcess(processId, {
            replacementId: replacement.videoId || replacement.id,
            title: replacement.title,
          });
        } else {
          finishFrontendDebugProcess(processId, {
            replacementId: null,
          });
          pushToast({
            variant: "info",
            title: t.videoCard.replaceVideoUnavailableTitle,
            description: t.videoCard.replaceVideoUnavailableDesc,
          });
        }
      } catch (error) {
        failFrontendDebugProcess(processId, error, { dismissedId, index });
        const description = error instanceof Error ? error.message : t.video.requestFailedGeneric;
        pushToast({
          variant: "error",
          title: t.video.requestFailed,
          description,
        });
      } finally {
        setReplacingVideoIndex(null);
      }
    },
    [
      pushToast,
      isLoadingMoreVideos,
      isSearching,
      recommendationSource,
      replacingVideoIndex,
      replaceVideoAtIndex,
      resolveVideoRecommendationRequest,
      selectedVideo?.id,
      selectedVideo?.videoId,
      setErrorMessage,
      setInitialVideoList,
      setSelectedVideo,
      setSummaryDiagnostics,
      tripDestination,
      videos,
    ],
  );

  const handleLoadMoreVideos = useCallback(async () => {
    const baseRequest = resolveVideoRecommendationRequest();
    if (!baseRequest) {
      return;
    }

    setIsLoadingMoreVideos(true);
    setErrorMessage(null);
    const processId = startFrontendDebugProcess("video-search-more", "載入更多旅遊影片推薦", {
      request: baseRequest,
      currentVideoCount: videos.length,
    });
    try {
      const excludeVideoIds = videos.map((video) => video.videoId || video.id).filter(Boolean);
      const request = {
        ...baseRequest,
        limit: 6,
        excludeVideoIds,
      } satisfies VideoRecommendationRequest & { excludeVideoIds: string[] };
      const outcome = await fetchVideoRecommendations(request);
      const newVideos = mergeVideosWithStoredSummaries(
        appendUniqueVideos(outcome.videos),
        videos,
      );
      appendToVideoList(newVideos);
      setRecommendationSource(outcome.source);
      setLastRecommendationRequest({
        destination: baseRequest.destination,
        keyword: baseRequest.keyword,
        days: baseRequest.days,
        preferences: baseRequest.preferences,
        limit: 6,
      } as VideoRecommendationRequest);
      enqueueVideoSummaries(newVideos, {
        destination: baseRequest.destination || tripDestination,
      });
      finishFrontendDebugProcess(processId, {
        requested: outcome.videos.length,
        appended: newVideos.length,
        source: outcome.source,
      });
      if (outcome.source === "mock-fallback") {
        pushToast({
          variant: "warning",
          title: t.video.mockVideosTitle,
          description: outcome.fallbackReason || t.video.mockVideosDesc,
        });
      }
    } catch (error) {
      failFrontendDebugProcess(processId, error, {
        currentVideoCount: videos.length,
      });
      const description = error instanceof Error ? error.message : t.video.requestFailedGeneric;
      setErrorMessage(description);
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description,
      });
    } finally {
      setIsLoadingMoreVideos(false);
    }
  }, [
    appendToVideoList,
    appendUniqueVideos,
    pushToast,
    resolveVideoRecommendationRequest,
    setErrorMessage,
    setLastRecommendationRequest,
    setRecommendationSource,
    tripDestination,
    videos,
  ]);

  const refreshVideoSummary = useCallback(
    async (video: VideoRecommendation) => {
      if (!video.videoId?.trim()) {
        return;
      }
      logFrontendDebugEvent("home-video", "refresh-summary-click", {
        videoId: video.videoId,
        title: video.title,
      });
      setSummaryDiagnostics(null);
      setIsSummarizing(true);
      try {
        const result = await summarizeVideo({
          videoId: video.videoId,
          title: video.title,
          destination: tripDestination,
          refresh: true,
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
          fallbackReason: result.fallbackReason,
          failedChunkCount: result.debug?.failedChunkCount,
        });
        logFrontendDebugEvent("home-video", "refresh-summary-ready", {
          videoId: result.video.videoId,
          title: result.video.title,
          locations: result.video.extractedLocations.length,
          segments: result.video.summarySegments?.length || 0,
          failedChunkCount: result.debug?.failedChunkCount ?? 0,
          cacheStatus: result.debug?.cacheStatus,
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
    },
    [
      pushToast,
      setIsSummarizing,
      setSelectedVideo,
      setSummaryDiagnostics,
      tripDestination,
      upsertVideo,
    ],
  );

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
      const processId = startFrontendDebugProcess("home-video-resume", "登入後恢復影片匯入前摘要", {
        videoId: pending.videoId,
      });
      const fromList = useVideoStore
        .getState()
        .videos.find((v: VideoRecommendation) => v.videoId === pending.videoId);
      if (fromList) {
        updateFrontendDebugProcess(processId, "video-found-in-store", {
          title: fromList.title,
        });
        await openVideoSummary(fromList);
        finishFrontendDebugProcess(processId, {
          resumedFrom: "store",
        });
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
          fallbackReason: result.fallbackReason,
          failedChunkCount: result.debug?.failedChunkCount,
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
          resumedFrom: "server-summary",
          title: result.video.title,
        });
      } catch (error) {
        failFrontendDebugProcess(processId, error, {
          videoId: pending.videoId,
        });
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
    <div className="min-h-screen">
      <HomeHeroBanner>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={focusVideoSearch}
            className="mb-4 h-auto rounded-full border-0 bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm hover:bg-white/30"
            aria-label={t.home.badgeFocusSearch}
          >
            <Sparkles className="size-3" aria-hidden />
            {t.home.badge}
          </Button>
          <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-md">{t.home.title}</h1>
          <p className="text-white/80 text-sm max-w-2xl mx-auto drop-shadow-sm">{t.home.subtitle}</p>
      </HomeHeroBanner>

      <div className="p-6 lg:p-8">

      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-10"
      >
        <VideoSearchBar
          ref={videoSearchInputRef}
          mode={recommendPanel === "itineraries" ? "itinerary" : "video"}
          onItinerarySearch={setItinerarySearchQuery}
        />
      </m.div>

      <HomeRecommendationsSection
        activePanel={recommendPanel}
        onPanelChange={handleRecommendPanelChange}
        isAuthenticated={isAuthenticated}
        itineraryQuery={itinerarySearchQuery}
        videoPanel={{
          videos,
          recommendationSource,
          errorMessage,
          showEmptyGrid,
          hasSearched,
          isSearching,
          canLoadMoreVideos,
          isLoadingMoreVideos,
          replacingVideoIndex,
          onVideoClick: (video) => void openVideoSummary(video),
          onLoadMoreVideos: () => void handleLoadMoreVideos(),
          onDismissVideo: (video, index) => void handleDismissVideo(video, index),
        }}
      />

      <VideoSummaryDrawer
        video={selectedVideo}
        open={selectedVideo !== null}
        onClose={handleCloseVideoDrawer}
        onRefreshSummary={
          selectedVideo?.videoId
            ? () => refreshVideoSummary(selectedVideo)
            : undefined
        }
      />

      <PlanningWaitGame
        isWaiting={homeVideoProcessingActive}
        waitKey={homeVideoProcessingKey}
        planningComplete={!homeVideoProcessingActive && videos.length > 0}
        promptDelayMs={3000}
        promptTitle="影片搜尋中，先玩個小遊戲吧！"
        gameDescription="正在查詢推薦影片，先玩小遊戲打發等待時間。"
        completionTitle="影片已載入"
        completionDescription="推薦影片已更新，可以繼續瀏覽了。"
      />

      <HomeTravelArticlesSection
        className="mt-12"
        query={searchQuery.trim() || itinerarySearchQuery.trim()}
      />

      <HomePartnerAdsSection className="mx-auto mt-12 max-w-6xl" />
      </div>
    </div>
  );
}
