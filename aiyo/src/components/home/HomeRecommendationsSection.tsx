"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "@/lib/motion";
import { Loader2, Map, TrendingUp, Video } from "lucide-react";
import VideoCard from "@/components/home/VideoCard";
import RecommendedItineraryCard from "@/components/home/RecommendedItineraryCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  replacingVideoIndex: number | null;
  onVideoClick: (video: VideoRecommendation) => void;
  onLoadMoreVideos: () => void;
  onDismissVideo: (video: VideoRecommendation, index: number) => void;
};

type Props = {
  activePanel: HomeRecommendPanel;
  onPanelChange: (panel: HomeRecommendPanel) => void;
  isAuthenticated: boolean;
  itineraryQuery: string;
  videoPanel: VideoPanelProps;
};

function sourceBadge(source: string | null) {
  if (source === "default-taiwan-cities") {
    return (
      <Badge variant="secondary" className="bg-primary/15 text-[10px] uppercase tracking-wide text-foreground/80 hover:bg-primary/15">
        {t.home.sourceDefault}
      </Badge>
    );
  }
  if (source === "mock-fallback") {
    return (
      <Badge variant="secondary" className="bg-secondary/15 text-[10px] uppercase tracking-wide text-foreground/80 hover:bg-secondary/15">
        {t.home.sourceFallback}
      </Badge>
    );
  }
  if (source === "single-video-url") {
    return (
      <Badge variant="secondary" className="bg-lavender/20 text-[10px] uppercase tracking-wide text-foreground/80 hover:bg-lavender/20">
        {t.home.sourceSingleVideo}
      </Badge>
    );
  }
  return null;
}

function EmptyStateCard({ title, hint }: { title: string; hint: string }) {
  return (
    <Card className="rounded-2xl border-dashed border-border-light bg-cream/40 py-0 shadow-none ring-0">
      <CardContent className="px-6 py-16 text-center">
        <p className="text-base font-medium text-foreground">{title}</p>
        <p className="mt-2 text-sm text-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}

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

  const panelTitle =
    activePanel === "videos" ? t.home.recommended : t.home.recommendedItineraries;
  const panelCount =
    activePanel === "videos" ? videoPanel.videos.length : itineraries.length;
  const PanelIcon = activePanel === "videos" ? Video : Map;

  return (
    <div className="mx-auto max-w-6xl" data-testid="home-recommendations-section">
      <div>
        <div className="mb-5 flex flex-wrap items-center gap-2 px-1">
          <PanelIcon className="size-4 text-secondary" />
          <h2 className="font-semibold text-foreground">{panelTitle}</h2>
          <Badge variant="secondary" className="bg-border-light text-muted hover:bg-border-light">
            {panelCount} {t.home.items}
          </Badge>
          <Tabs
            value={activePanel}
            onValueChange={(value) => onPanelChange(value as HomeRecommendPanel)}
            className="ml-auto w-auto gap-0"
          >
            <TabsList className="h-auto rounded-full bg-cream/80 p-1">
              <TabsTrigger
                value="videos"
                data-testid="home-recommend-tab-videos"
                className="rounded-full px-2.5 py-1 text-xs data-active:bg-primary/15 data-active:text-primary"
              >
                {t.home.recommended}
              </TabsTrigger>
              <TabsTrigger
                value="itineraries"
                data-testid="home-recommend-tab-itineraries"
                className="rounded-full px-2.5 py-1 text-xs data-active:bg-primary/15 data-active:text-primary"
              >
                {t.home.recommendedItineraries}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <AnimatePresence mode="wait">
          {activePanel === "videos" ? (
            <m.div
              key="videos-panel"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <TrendingUp className="size-4 text-secondary" />
                {sourceBadge(videoPanel.recommendationSource)}
                {videoPanel.videos.length > 0 &&
                  videoPanel.canLoadMoreVideos &&
                  !videoPanel.isSearching && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={videoPanel.onLoadMoreVideos}
                      disabled={videoPanel.isLoadingMoreVideos}
                      className="ml-auto rounded-full border-border-light bg-surface shadow-soft hover:bg-primary/10"
                    >
                      {videoPanel.isLoadingMoreVideos ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {videoPanel.isLoadingMoreVideos
                        ? t.home.loadingMoreVideos
                        : t.home.moreVideos}
                    </Button>
                  )}
              </div>

              {videoPanel.errorMessage && (
                <Alert variant="destructive" className="mb-4 rounded-2xl border-danger/20 bg-danger/10">
                  <AlertDescription className="text-danger">{videoPanel.errorMessage}</AlertDescription>
                </Alert>
              )}

              {videoPanel.showEmptyGrid ? (
                <EmptyStateCard
                  title={videoPanel.hasSearched ? t.home.noApiResults : t.home.emptyTitle}
                  hint={t.home.emptyHint}
                />
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {videoPanel.videos.map((video, index) =>
                    videoPanel.replacingVideoIndex === index ? (
                      <Card
                        key={`replacing-${index}`}
                        className="overflow-hidden rounded-2xl border-0 bg-surface py-0 shadow-soft ring-0"
                        data-testid="video-card-replacing"
                      >
                        <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-foreground/5 to-foreground/10">
                          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
                          <span className="sr-only">{t.videoCard.replacingVideo}</span>
                        </div>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted">{t.videoCard.replacingVideo}</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <VideoCard
                        key={video.id}
                        video={video}
                        index={index}
                        onClick={() => videoPanel.onVideoClick(video)}
                        onDismiss={() => videoPanel.onDismissVideo(video, index)}
                      />
                    ),
                  )}
                </div>
              )}
            </m.div>
          ) : (
            <m.div
              key="itineraries-panel"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              {!isAuthenticated ? (
                <Card
                  className="rounded-2xl border-dashed border-border-light bg-cream/40 py-0 shadow-none ring-0"
                  data-testid="public-itinerary-login-cta"
                >
                  <CardContent className="px-6 py-16 text-center">
                    <TrendingUp className="mx-auto mb-3 size-8 text-primary/50" />
                    <p className="text-base font-medium text-foreground">
                      {t.home.publicItineraryLoginTitle}
                    </p>
                    <p className="mt-2 text-sm text-muted">{t.home.publicItineraryLoginHint}</p>
                    <Button
                      type="button"
                      onClick={() => router.push(`/login?callbackUrl=${encodeURIComponent("/")}`)}
                      className="mt-6 rounded-xl bg-primary hover:bg-primary-dark"
                    >
                      {t.sidebar.signIn}
                    </Button>
                  </CardContent>
                </Card>
              ) : isLoadingItineraries ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted">
                  <Loader2 className="size-5 animate-spin" />
                  <span className="text-sm">{t.publicItinerary.loading}</span>
                </div>
              ) : itineraryError ? (
                <Alert variant="destructive" className="rounded-2xl border-danger/20 bg-danger/10">
                  <AlertDescription className="text-danger">{itineraryError}</AlertDescription>
                </Alert>
              ) : itineraries.length === 0 ? (
                <EmptyStateCard
                  title={t.home.publicItineraryEmptyTitle}
                  hint={t.home.publicItineraryEmptyHint}
                />
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
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default HomeRecommendationsSection;
