"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2, Map, TrendingUp, Video } from "lucide-react";
import VideoCard from "@/components/home/VideoCard";
import RecommendedItineraryCard from "@/components/home/RecommendedItineraryCard";
import { listPublicItineraries } from "@/services/publicItineraryClient";
import { zhTW as t } from "@/locales/zh-TW";
import type { PublicItinerarySummary, VideoRecommendation } from "@/types";

export type HomeRecommendPanel = "videos" | "itineraries";

type VideoPanelProps = {
  videos: VideoRecommendation[];
  recommendationSource: string | null;
  errorMessage: string | null;
  showEmptyGrid: boolean;
  hasSearched: boolean;
  isSearching: boolean;
  canLoadMoreVideos: boolean;
  isLoadingMoreVideos: boolean;
  onVideoClick: (video: VideoRecommendation) => void;
  onLoadMoreVideos: () => void;
};

type Props = {
  activePanel: HomeRecommendPanel;
  onPanelChange: (panel: HomeRecommendPanel) => void;
  isAuthenticated: boolean;
  itineraryQuery: string;
  videoPanel: VideoPanelProps;
};

function HomeRecommendationsSection({
  activePanel,
  onPanelChange,
  isAuthenticated,
  itineraryQuery,
  videoPanel,
}: Props) {
  const router = useRouter();
  const [itineraries, setItineraries] = useState<PublicItinerarySummary[]>([]);
  const [itineraryError, setItineraryError] = useState<string | null>(null);
  const [isLoadingItineraries, setIsLoadingItineraries] = useState(false);

  const loadItineraries = useCallback(async (query?: string) => {
    if (!isAuthenticated) {
      return;
    }
    setIsLoadingItineraries(true);
    setItineraryError(null);
    try {
      const result = await listPublicItineraries({ q: query, limit: 12 });
      setItineraries(result.items);
    } catch (error) {
      setItineraryError(error instanceof Error ? error.message : t.publicItinerary.loadFailed);
      setItineraries([]);
    } finally {
      setIsLoadingItineraries(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (activePanel !== "itineraries" || !isAuthenticated) {
      return;
    }
    void loadItineraries(itineraryQuery);
  }, [activePanel, isAuthenticated, itineraryQuery, loadItineraries]);

  function switchToVideos() {
    onPanelChange("videos");
  }

  function switchToItineraries() {
    onPanelChange("itineraries");
  }

  const panelTitle =
    activePanel === "videos" ? t.home.recommended : t.home.recommendedItineraries;
  const panelCount =
    activePanel === "videos" ? videoPanel.videos.length : itineraries.length;
  const PanelIcon = activePanel === "videos" ? Video : Map;

  return (
    <div className="max-w-6xl mx-auto" data-testid="home-recommendations-section">
      <div className="group relative">
        <button
          type="button"
          aria-label={t.home.switchToVideos}
          data-testid="home-recommend-prev"
          onClick={switchToVideos}
          className="absolute -left-3 top-8 z-10 flex size-9 items-center justify-center rounded-full border border-border-light bg-white/90 text-foreground shadow-md backdrop-blur-sm transition-opacity hover:bg-white opacity-50 hover:opacity-100"
        >
          <ChevronLeft className="size-5" />
        </button>

        <button
          type="button"
          aria-label={t.home.switchToItineraries}
          data-testid="home-recommend-next"
          onClick={switchToItineraries}
          className="absolute -right-3 top-8 z-10 flex size-9 items-center justify-center rounded-full border border-border-light bg-white/90 text-foreground shadow-md backdrop-blur-sm transition-opacity hover:bg-white opacity-50 hover:opacity-100"
        >
          <ChevronRight className="size-5" />
        </button>

        <div className="mb-5 flex flex-wrap items-center gap-2 px-1">
          <PanelIcon className="size-4 text-secondary" />
          <h2 className="font-semibold text-foreground">{panelTitle}</h2>
          <span className="rounded-full bg-border-light px-2 py-0.5 text-xs text-muted">
            {panelCount} {t.home.items}
          </span>
          <div className="ml-auto flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={switchToVideos}
              data-testid="home-recommend-tab-videos"
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                activePanel === "videos"
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:bg-cream/60"
              }`}
            >
              {t.home.recommended}
            </button>
            <button
              type="button"
              onClick={switchToItineraries}
              data-testid="home-recommend-tab-itineraries"
              className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                activePanel === "itineraries"
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:bg-cream/60"
              }`}
            >
              {t.home.recommendedItineraries}
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activePanel === "videos" ? (
            <motion.div
              key="videos-panel"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <TrendingUp className="size-4 text-secondary" />
                {videoPanel.recommendationSource === "default-taiwan-cities" && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/80">
                    {t.home.sourceDefault}
                  </span>
                )}
                {videoPanel.recommendationSource === "mock-fallback" && (
                  <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/80">
                    {t.home.sourceFallback}
                  </span>
                )}
                {videoPanel.recommendationSource === "single-video-url" && (
                  <span className="rounded-full bg-lavender/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/80">
                    {t.home.sourceSingleVideo}
                  </span>
                )}
                {videoPanel.videos.length > 0 &&
                  videoPanel.canLoadMoreVideos &&
                  !videoPanel.isSearching && (
                    <button
                      type="button"
                      onClick={videoPanel.onLoadMoreVideos}
                      disabled={videoPanel.isLoadingMoreVideos}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border-light bg-surface px-3 py-1 text-xs font-medium text-foreground shadow-soft transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {videoPanel.isLoadingMoreVideos ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {videoPanel.isLoadingMoreVideos
                        ? t.home.loadingMoreVideos
                        : t.home.moreVideos}
                    </button>
                  )}
              </div>

              {videoPanel.errorMessage && (
                <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {videoPanel.errorMessage}
                </div>
              )}

              {videoPanel.showEmptyGrid ? (
                <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-6 py-16 text-center">
                  <p className="text-base font-medium text-foreground">
                    {videoPanel.hasSearched ? t.home.noApiResults : t.home.emptyTitle}
                  </p>
                  <p className="mt-2 text-sm text-muted">{t.home.emptyHint}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {videoPanel.videos.map((video, index) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      index={index}
                      onClick={() => videoPanel.onVideoClick(video)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="itineraries-panel"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              {!isAuthenticated ? (
                <div
                  className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-6 py-16 text-center"
                  data-testid="public-itinerary-login-cta"
                >
                  <TrendingUp className="mx-auto mb-3 size-8 text-primary/50" />
                  <p className="text-base font-medium text-foreground">
                    {t.home.publicItineraryLoginTitle}
                  </p>
                  <p className="mt-2 text-sm text-muted">{t.home.publicItineraryLoginHint}</p>
                  <button
                    type="button"
                    onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent("/")}`)}
                    className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-dark"
                  >
                    {t.sidebar.signIn}
                  </button>
                </div>
              ) : isLoadingItineraries ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-sm">{t.publicItinerary.loading}</span>
                </div>
              ) : itineraryError ? (
                <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {itineraryError}
                </div>
              ) : itineraries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-6 py-16 text-center">
                  <p className="text-base font-medium text-foreground">
                    {t.home.publicItineraryEmptyTitle}
                  </p>
                  <p className="mt-2 text-sm text-muted">{t.home.publicItineraryEmptyHint}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {itineraries.map((item, index) => (
                    <RecommendedItineraryCard
                      key={item.id}
                      itinerary={item}
                      index={index}
                      onClick={() => router.push(`/itinerary/public/${item.id}`)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default HomeRecommendationsSection;
