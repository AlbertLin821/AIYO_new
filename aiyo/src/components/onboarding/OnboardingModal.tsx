"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, MapPin, RefreshCw, Sparkles, X } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { fetchVideoRecommendations } from "@/services/videoClient";
import { useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";
import type { VideoRecommendation } from "@/types";

const fallbackRecommendedVideos: VideoRecommendation[] = [
  "台北", "新北", "桃園", "台中", "台南", "高雄",
].map((city) => ({
  id: `fallback_${city}`,
  videoId: `fallback_${city}`,
  title: `${city}旅遊景點美食懶人包`,
  url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${city} 旅遊 景點 vlog`)}`,
  thumbnail: "",
  duration: "00:00",
  summary: `${city}旅遊推薦`,
  description: `${city} 旅遊 景點 vlog`,
  source: "client-fallback",
  relevanceReason: `六都空白狀態推薦：${city}旅遊入門影片。`,
  timestamps: [],
  extractedLocations: [],
  summarySegments: [],
  listProvenance: "mock-fallback",
}));

export default function OnboardingModal() {
  const { showOnboarding, setShowOnboarding } = useUIStore();
  const { setDestination, setDays } = useTripStore();
  const { setFirstVisit, updateProfile } = useUserStore();
  const [destinationInput, setDestinationInput] = useState("");
  const [daysInput, setDaysInput] = useState("");
  const [recommendedVideos, setRecommendedVideos] = useState<VideoRecommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  async function loadRecommendations() {
    setLoadingRecommendations(true);
    try {
      const result = await fetchVideoRecommendations({
        destination: destinationInput.trim() || undefined,
        days: daysInput.trim() ? Number(daysInput) : undefined,
        preferences: destinationInput.trim() ? ["美食", "景點", "懶人包"] : undefined,
        limit: 6,
      });
      setRecommendedVideos(result.videos);
    } catch {
      setRecommendedVideos(fallbackRecommendedVideos);
    } finally {
      setLoadingRecommendations(false);
    }
  }

  useEffect(() => {
    void loadRecommendations();
    // The initial empty state intentionally loads six Taiwan-city fallback videos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish(skip: boolean) {
    if (!skip) {
      if (destinationInput.trim()) {
        setDestination(destinationInput.trim());
        updateProfile({ destination: destinationInput.trim() });
      }
      if (daysInput.trim()) {
        const parsedDays = parseInt(daysInput, 10) || 5;
        setDays(parsedDays);
        updateProfile({ travelDays: parsedDays });
      }
    }
    setFirstVisit(false);
    setShowOnboarding(false);
  }

  return (
    <AnimatePresence>
      {showOnboarding && (
        <motion.div
          data-testid="onboarding-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            data-testid="onboarding-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => finish(true)}
          />

          <motion.div
            data-testid="onboarding-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-surface shadow-soft-lg"
          >
            <button
              data-testid="onboarding-close-button"
              aria-label={t.onboarding.closeModalAria}
              onClick={() => finish(true)}
              className="absolute right-4 top-4 z-10 cursor-pointer rounded-full p-1.5 text-muted transition-colors hover:bg-border-light hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="h-2 bg-gradient-to-r from-primary via-lavender to-secondary" />

            <div className="p-8 pt-6">
              <div className="mb-8 text-center">
                <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-lavender/15">
                  <Sparkles className="size-7 text-primary" />
                </div>
                <h2 id="onboarding-title" className="mb-2 text-2xl font-bold text-foreground">{t.onboarding.welcomeTitle}</h2>
                <p className="text-sm leading-relaxed text-muted">{t.onboarding.welcomeBody}</p>
              </div>

              <div className="flex flex-col gap-5">
                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="size-4 text-secondary" />
                    {t.onboarding.destination}
                  </label>
                  <input
                    type="text"
                    value={destinationInput}
                    onChange={(event) => setDestinationInput(event.target.value)}
                    placeholder={t.onboarding.destinationPh}
                    className="w-full rounded-xl border border-border bg-cream/50 px-4 py-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <CalendarDays className="size-4 text-primary" />
                    {t.onboarding.tripDays}
                  </label>
                  <input
                    type="number"
                    value={daysInput}
                    onChange={(event) => setDaysInput(event.target.value)}
                    placeholder={t.onboarding.daysPlaceholder}
                    min={1}
                    max={30}
                    className="w-full rounded-xl border border-border bg-cream/50 px-4 py-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-border-light bg-cream/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.onboarding.recommendedTitle}</p>
                    <p className="mt-1 text-xs text-muted">{t.onboarding.recommendedHint}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadRecommendations()}
                    disabled={loadingRecommendations}
                    className="rounded-lg p-2 text-primary hover:bg-primary/10 disabled:opacity-50"
                    aria-label={t.onboarding.refreshRecommendationsAria}
                  >
                    <RefreshCw className={`size-4 ${loadingRecommendations ? "animate-spin" : ""}`} />
                  </button>
                </div>
                <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
                  {recommendedVideos.map((video) => (
                    <button
                      key={video.id}
                      data-testid="recommended-video"
                      type="button"
                      onClick={() => window.open(video.url, "_blank", "noopener,noreferrer")}
                      className="rounded-xl border border-border-light bg-surface px-3 py-2 text-left hover:border-primary/30 hover:bg-primary/5"
                    >
                      <p className="line-clamp-2 text-xs font-medium text-foreground">{video.title}</p>
                      <p className="mt-1 text-[11px] text-muted">{video.relevanceReason}</p>
                    </button>
                  ))}
                  {!loadingRecommendations && recommendedVideos.length === 0 && (
                    <p className="col-span-full rounded-xl border border-dashed border-border-light px-3 py-4 text-center text-xs text-muted">
                      {t.onboarding.noRecommendedVideos}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  data-testid="onboarding-skip-button"
                  onClick={() => finish(true)}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-border-light hover:text-foreground"
                >
                  {t.onboarding.skip}
                </button>
                <button
                  data-testid="onboarding-complete-button"
                  onClick={() => finish(false)}
                  className="cursor-pointer rounded-xl bg-gradient-to-r from-primary to-primary-dark px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
                >
                  {t.onboarding.start}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
