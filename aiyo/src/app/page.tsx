"use client";

import { motion } from "framer-motion";
import { Sparkles, TrendingUp } from "lucide-react";
import VideoCard from "@/components/home/VideoCard";
import VideoSearchBar from "@/components/home/VideoSearchBar";
import VideoSummaryDrawer from "@/components/home/VideoSummaryDrawer";
import { zhTW as t } from "@/locales/zh-TW";
import { useVideoStore } from "@/stores/useVideoStore";

export default function HomePage() {
  const {
    videos,
    selectedVideo,
    setSelectedVideo,
    errorMessage,
    recommendationSource,
    setSummaryDiagnostics,
    searchQuery,
  } = useVideoStore();

  const hasSearched = Boolean(searchQuery.trim());
  const showEmptyGrid = videos.length === 0 && !errorMessage;

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium mb-4">
          <Sparkles className="size-3" />
          {t.home.badge}
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">{t.home.title}</h1>
        <p className="text-muted text-sm max-w-2xl mx-auto">{t.home.subtitle}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-10"
      >
        <VideoSearchBar />
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
          {recommendationSource === "mock-fallback" && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-secondary/15 px-2 py-0.5 text-foreground/80">
              {t.home.sourceFallback}
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
                onClick={() => {
                  setSummaryDiagnostics(null);
                  setSelectedVideo(video);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <VideoSummaryDrawer
        video={selectedVideo}
        open={selectedVideo !== null}
        onClose={() => setSelectedVideo(null)}
      />
    </div>
  );
}
