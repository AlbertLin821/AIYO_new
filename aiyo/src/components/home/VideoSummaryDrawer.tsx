"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  Play,
  Plus,
  X,
} from "lucide-react";
import type { Video } from "@/types";
import { zhTW as t } from "@/locales/zh-TW";
import { buildPinsFromLocations } from "@/services/mapSync";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useVideoStore } from "@/stores/useVideoStore";

interface VideoSummaryDrawerProps {
  video: Video | null;
  open: boolean;
  onClose: () => void;
}

function compactText(value: string, maxChars: number): string {
  const text = value.replace(/\s+/g, "").trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function parseTimestampToSeconds(timestamp?: string): number {
  if (!timestamp) {
    return 0;
  }
  const parts = timestamp
    .split(":")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function getSegmentStartSeconds(startSeconds?: number, timestamp?: string): number {
  return typeof startSeconds === "number" && Number.isFinite(startSeconds)
    ? startSeconds
    : parseTimestampToSeconds(timestamp);
}

function ProcessingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border-light bg-cream/40 px-3 py-3 text-sm text-muted">
      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export default function VideoSummaryDrawer({
  video,
  open,
  onClose,
}: VideoSummaryDrawerProps) {
  const router = useRouter();
  const addDay = useTripStore((state) => state.addDay);
  const addItineraryItem = useTripStore((state) => state.addItineraryItem);
  const itinerary = useTripStore((state) => state.itinerary);
  const addPins = useMapStore((state) => state.addPins);
  const summaryDiagnostics = useVideoStore((state) => state.summaryDiagnostics);
  const isSummarizing = useVideoStore((state) => state.isSummarizing);
  const pushToast = useToastStore((state) => state.pushToast);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [failedImageVideoId, setFailedImageVideoId] = useState<string | null>(null);
  const [activeStart, setActiveStart] = useState<{ videoId: string; seconds: number } | null>(null);
  const videoId = video?.listProvenance === "default-taiwan-cities" ? undefined : video?.videoId;

  const conciseSummary = useMemo(
    () => compactText(video?.summary || "", 40),
    [video?.summary],
  );

  const embedUrl = useMemo(
    () => {
      if (!videoId) {
        return null;
      }
      const startSeconds = activeStart?.videoId === videoId ? activeStart.seconds : null;
      const start = startSeconds !== null ? `&start=${Math.max(0, Math.floor(startSeconds))}` : "";
      return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1${start}`;
    },
    [activeStart, videoId],
  );

  if (!video) {
    return null;
  }

  const activeVideo = video;
  const imageFailed = failedImageVideoId === activeVideo.id;
  const isProcessingVideo =
    isSummarizing &&
    !summaryDiagnostics?.summaryUnavailable &&
    (!activeVideo.summary ||
      (activeVideo.summarySegments || []).length === 0 ||
      activeVideo.extractedLocations.length === 0);
  const verifiedLocations = activeVideo.extractedLocations.filter(
    (location) => location.verified === true && location.resolvedFrom === "google-geocode",
  );

  function showToastMessage(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function handleAddToItinerary() {
    if (verifiedLocations.length === 0) {
      pushToast({
        variant: "warning",
        title: t.drawer.noLocationsToastTitle,
        description: t.drawer.noLocationsToastDesc,
      });
      return;
    }

    setAdding(true);
    const targetDayNumber = itinerary.length + 1;
    addDay();

    verifiedLocations.forEach((location, index) => {
      addItineraryItem(targetDayNumber, {
        id: `video_${activeVideo.id}_${index}`,
        dayNumber: targetDayNumber,
        time: `${String(9 + index * 2).padStart(2, "0")}:00`,
        title: location.name,
        type: index === 1 ? "restaurant" : "attraction",
        notes: location.description,
        location,
        source: "video",
      });
    });
    addPins(buildPinsFromLocations(verifiedLocations, "video"));

    setAdding(false);
    showToastMessage(t.drawer.toastItinerary);
    onClose();
    router.push("/itinerary");
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-foreground/10"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            data-testid="video-summary-drawer"
            className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-lg flex-col bg-surface shadow-soft-lg"
          >
            <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
              <div className="flex flex-col gap-2">
                <h2 className="font-semibold text-foreground">{t.drawer.title}</h2>
                {summaryDiagnostics && (
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                      {summaryDiagnostics.transcriptSource === "youtube"
                        ? t.video.transcriptYoutube
                        : summaryDiagnostics.transcriptSource === "none"
                          ? t.video.transcriptNone
                          : t.video.transcriptFallback}
                    </span>
                    {summaryDiagnostics.mapsProvenance === "catalog-fallback" && (
                      <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/80">
                        {t.video.mapsCatalog}
                      </span>
                    )}
                    {summaryDiagnostics.mapsProvenance === "google-geocoding" && (
                      <span className="rounded-full bg-tertiary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/80">
                        {t.video.mapsGoogle}
                      </span>
                    )}
                    {summaryDiagnostics.mapsProvenance === "mixed" && (
                      <span className="rounded-full bg-tertiary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/80">
                        {t.video.mapsMixed}
                      </span>
                    )}
                    {process.env.NODE_ENV !== "production" && summaryDiagnostics.summarySource && (
                      <span className="rounded-full bg-border-light px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">
                        {summaryDiagnostics.summarySource}
                      </span>
                    )}
                    {process.env.NODE_ENV !== "production" && summaryDiagnostics.segmentSource && (
                      <span className="rounded-full bg-border-light px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">
                        {summaryDiagnostics.segmentSource}
                      </span>
                    )}
                    {process.env.NODE_ENV !== "production" && summaryDiagnostics.captionLanguage && (
                      <span className="rounded-full bg-border-light px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">
                        {`caption:${summaryDiagnostics.captionLanguage}`}
                      </span>
                    )}
                    {process.env.NODE_ENV !== "production" && summaryDiagnostics.captionKind && (
                      <span className="rounded-full bg-border-light px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">
                        {summaryDiagnostics.captionKind}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t.drawer.closeDrawerAria}
                className="cursor-pointer rounded-full p-1.5 text-muted transition-colors hover:bg-border-light hover:text-foreground"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-foreground/5 to-foreground/10">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title={activeVideo.title}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                ) : activeVideo.thumbnail && !imageFailed ? (
                  <Image
                    src={activeVideo.thumbnail}
                    alt={activeVideo.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover"
                    onError={() => setFailedImageVideoId(activeVideo.id)}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/60">
                    <AlertCircle className="size-6" />
                    <span className="text-xs font-medium">無法載入影片預覽</span>
                  </div>
                )}

                {!embedUrl && (
                  <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1" aria-hidden>
                    <div className="flex size-16 items-center justify-center rounded-full bg-white/90 shadow-lg">
                      <Play className="ml-1 size-7 text-primary" fill="currentColor" />
                    </div>
                    <span className="rounded-md bg-foreground/55 px-2 py-0.5 text-[10px] font-medium text-white">
                      {t.drawer.previewThumbOnly}
                    </span>
                  </div>
                )}

                <div className="absolute bottom-3 right-3 rounded-md bg-foreground/70 px-2 py-1 text-xs text-white">
                  {activeVideo.duration}
                </div>
              </div>

              <div className="flex flex-col gap-6 p-6">
                <div>
                  <h3 className="mb-2 text-lg font-bold leading-snug text-foreground">
                    {activeVideo.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <ExternalLink className="size-3" />
                    <span>{activeVideo.source}</span>
                    <span>&bull;</span>
                    <span>{activeVideo.duration}</span>
                  </div>
                  <div className="mt-3">
                    <a
                      href={activeVideo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:text-primary-dark"
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      {t.drawer.openOnYoutube}
                    </a>
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">{t.drawer.summary}</h4>
                  <div className="space-y-2">
                    {summaryDiagnostics?.summaryUnavailable ? (
                      <p className="rounded-xl border border-border-light bg-cream/40 px-3 py-3 text-sm leading-relaxed text-muted">
                        {summaryDiagnostics.unavailableReason ||
                          "無法取得逐字稿，暫時無法產生精準摘要。"}
                      </p>
                    ) : conciseSummary ? (
                      <p className="text-sm leading-relaxed text-muted">{conciseSummary}</p>
                    ) : isProcessingVideo ? (
                      <ProcessingRow label={t.drawer.videoProcessing} />
                    ) : (
                      <p className="text-sm leading-relaxed text-muted">{activeVideo.summary}</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-sm font-semibold text-foreground">
                    {t.drawer.keySegments}
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {summaryDiagnostics?.summaryUnavailable ? (
                      <p className="text-sm text-muted">無法取得逐字稿，暫時無法產生精準片段。</p>
                    ) : activeVideo.summarySegments && activeVideo.summarySegments.length > 0 ? (
                      activeVideo.summarySegments.map((segment, segmentIndex) => (
                        <div key={`${segment.id}_${segmentIndex}`} className="rounded-xl bg-primary/5 px-3 py-3">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (videoId) {
                                  setActiveStart({
                                    videoId,
                                    seconds: getSegmentStartSeconds(segment.startSeconds, segment.startLabel || segment.timestamp),
                                  });
                                }
                              }}
                              title={t.drawer.jumpToTimestamp}
                              className="min-w-[52px] cursor-pointer rounded-md bg-primary/10 px-2 py-0.5 text-center font-mono text-xs text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                              {segment.startLabel || segment.timestamp}
                            </button>
                            <div className="min-w-0 flex-1">
                              {segment.title && (
                                <p className="text-sm font-medium text-foreground">
                                  {segment.title}
                                </p>
                              )}
                              <p className="mt-1 text-sm text-muted">
                                {segment.summary || segment.text}
                              </p>
                              {segment.highlights && segment.highlights.length > 0 && (
                                <div className="mt-2 flex flex-col gap-1">
                                  {segment.highlights.map((highlight, highlightIndex) => (
                                    <p
                                      key={`${segment.id}_${segmentIndex}_${highlight}_${highlightIndex}`}
                                      className="rounded-lg bg-surface/80 px-2 py-1 text-xs text-foreground/80"
                                    >
                                      {highlight}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {segment.locationHints && segment.locationHints.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {segment.locationHints.map((hint, hintIndex) => (
                                    <span
                                      key={`${segment.id}_${segmentIndex}_${hint}_${hintIndex}`}
                                      className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] text-foreground/80"
                                    >
                                      {hint}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : activeVideo.timestamps.length > 0 ? (
                      activeVideo.timestamps.map((timestamp) => (
                        <div
                          key={`${activeVideo.id}_${timestamp.time}`}
                          className="flex items-center gap-3 rounded-xl bg-primary/5 px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (videoId) {
                                setActiveStart({
                                  videoId,
                                  seconds: getSegmentStartSeconds(undefined, timestamp.time),
                                });
                              }
                            }}
                            title={t.drawer.jumpToTimestamp}
                            className="min-w-[52px] cursor-pointer rounded-md bg-primary/10 px-2 py-0.5 text-center font-mono text-xs text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            {timestamp.time}
                          </button>
                          <span className="text-sm text-muted">{timestamp.label}</span>
                        </div>
                      ))
                    ) : isProcessingVideo ? (
                      <ProcessingRow label={t.drawer.videoProcessing} />
                    ) : (
                      <p className="text-sm text-muted">目前沒有可顯示的重點片段。</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <MapPin className="size-4 text-secondary" />
                    {t.drawer.extractedLocations}
                  </h4>
                  <div className="flex flex-col gap-2" data-testid="video-location-list">
                    {verifiedLocations.length > 0 ? (
                      verifiedLocations.map((location) => (
                        <div
                          key={`${activeVideo.id}_${location.name}`}
                          className="flex items-start gap-3 rounded-xl border border-border-light bg-cream/50 px-3 py-2.5"
                          data-testid="video-location-item"
                        >
                          <div className="mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary/15">
                            <MapPin className="size-4 text-secondary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{location.name}</p>
                            <p className="mt-0.5 text-xs text-muted">{location.description}</p>
                            {location.resolvedFrom && (
                              <p className="mt-1 text-[10px] text-muted">
                                {location.resolvedFrom === "google-geocode"
                                  ? t.video.mapsGoogle
                                  : location.resolvedFrom === "title-poi"
                                    ? t.video.mapsTitlePoi
                                    : t.video.mapsCatalog}
                                {location.verified === false ||
                                (location.confidence !== undefined && location.confidence < 0.45)
                                  ? `（${t.video.locationLowConfidence}）`
                                  : ""}
                              </p>
                            )}
                            {location.address && (
                              <p className="mt-1 text-[10px] text-muted">{location.address}</p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : isProcessingVideo ? (
                      <ProcessingRow label={t.drawer.videoProcessing} />
                    ) : (
                      <p className="text-sm text-muted">
                        {summaryDiagnostics?.summaryUnavailable
                          ? "無法取得逐字稿，暫時無法抽出可靠地點。"
                          : t.drawer.noVerifiedLocations}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 pb-4">
                  <button
                    type="button"
                    onClick={() => void handleAddToItinerary()}
                    disabled={adding}
                    data-testid="video-add-to-itinerary-button"
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-dark py-3 text-sm font-medium text-white transition-all hover:scale-[1.01] hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {adding ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t.drawer.createDayLoading}
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" />
                        {t.drawer.createDay}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              className="fixed bottom-8 left-1/2 z-[60] flex items-center gap-2 rounded-2xl bg-foreground px-5 py-3 text-sm font-medium text-white shadow-lg"
            >
              <Check className="size-4 text-tertiary" />
              {toast}
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
