"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
import { getSegmentSeekSeconds, parseTimestampToSeconds } from "@/lib/videoTimestamp";
import {
  clearPendingVideoImport,
  readPendingVideoImport,
  savePendingVideoImport,
} from "@/lib/pendingVideoImport";
import { zhTW as t } from "@/locales/zh-TW";
import {
  getVideoImportCandidateLocations,
  importVideoVerifiedPlacesToTrip,
} from "@/services/videoPlaceImport";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useVideoStore, type SummaryDiagnostics } from "@/stores/useVideoStore";
import YoutubeIframePlayer from "@/components/home/YoutubeIframePlayer";

interface VideoSummaryDrawerProps {
  video: Video | null;
  open: boolean;
  onClose: () => void;
}

function drawerSummarySourceLabel(key: SummaryDiagnostics["summarySource"]): string | null {
  switch (key) {
    case "ollama-transcript":
      return t.drawer.sourceSummaryModel;
    case "heuristic-transcript-fallback":
      return t.drawer.sourceSummaryHeuristic;
    case "ollama-description-fallback":
      return t.drawer.sourceSummaryDescription;
    case "ollama-synthetic-fallback":
      return t.drawer.sourceSummaryHeuristic;
    case "unavailable":
      return t.drawer.sourceSummaryUnavailable;
    default:
      return null;
  }
}

function drawerSegmentSourceLabel(key: SummaryDiagnostics["segmentSource"]): string | null {
  switch (key) {
    case "transcript-chunks":
      return t.drawer.sourceSegmentsTranscript;
    case "deterministic-mentions":
      return t.drawer.sourceSegmentsMentions;
    case "description-fallback":
      return t.drawer.sourceSegmentsDescription;
    case "synthetic-fallback":
      return t.drawer.sourceSegmentsSynthetic;
    case "unavailable":
      return t.drawer.sourceSegmentsUnavailable;
    default:
      return null;
  }
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
  const { status: sessionStatus } = useSession();
  const summaryDiagnostics = useVideoStore((state) => state.summaryDiagnostics);
  const isSummarizing = useVideoStore((state) => state.isSummarizing);
  const pushToast = useToastStore((state) => state.pushToast);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [failedImageVideoId, setFailedImageVideoId] = useState<string | null>(null);
  const [seekTarget, setSeekTarget] = useState({ token: 0, seconds: 0 });
  const [selectedLocationNames, setSelectedLocationNames] = useState<Set<string>>(() => new Set());
  const [importTargetDay, setImportTargetDay] = useState(1);
  const [importDayPickerOpen, setImportDayPickerOpen] = useState(false);
  const tripItinerary = useTripStore((state) => state.itinerary);
  const videoId = video?.videoId;

  const importCandidates = useMemo(
    () => (video ? getVideoImportCandidateLocations(video) : []),
    [video],
  );

  useEffect(() => {
    if (!open || !video?.videoId) {
      return;
    }
    setSeekTarget({ token: 0, seconds: 0 });
  }, [open, video?.videoId]);

  useEffect(() => {
    if (!open || !video) {
      return;
    }
    const candidates = getVideoImportCandidateLocations(video);
    const pending = readPendingVideoImport();
    if (pending && pending.videoId === video.videoId) {
      const allowed = new Set(candidates.map((c) => c.name));
      const names = pending.selectedNames.filter((n) => allowed.has(n));
      setSelectedLocationNames(
        names.length > 0 ? new Set(names) : new Set(candidates.map((c) => c.name)),
      );
      const days = useTripStore.getState().itinerary.map((d) => d.dayNumber);
      const dayOk = days.includes(pending.targetDay);
      setImportTargetDay(dayOk ? pending.targetDay : (days[0] ?? pending.targetDay));
      clearPendingVideoImport();
    } else {
      setSelectedLocationNames(new Set(candidates.map((loc) => loc.name)));
      const firstDay = useTripStore.getState().itinerary[0]?.dayNumber ?? 1;
      setImportTargetDay(firstDay);
    }
  }, [open, video?.id, video]);

  useEffect(() => {
    if (!open) {
      setImportDayPickerOpen(false);
    }
  }, [open]);

  if (!video) {
    return null;
  }

  const activeVideo = video;
  const imageFailed = failedImageVideoId === activeVideo.id;
  const isProcessingVideo =
    isSummarizing &&
    !summaryDiagnostics?.summaryUnavailable &&
    ((activeVideo.summarySegments || []).length === 0 || activeVideo.extractedLocations.length === 0);
  const verifiedLocations = activeVideo.extractedLocations.filter(
    (location) => location.verified === true && location.resolvedFrom === "google-geocode",
  );

  function bumpSeek(seconds: number) {
    if (!videoId) {
      return;
    }
    setSeekTarget((prev) => ({
      token: prev.token + 1,
      seconds: Math.max(0, Math.floor(seconds)),
    }));
  }

  function showToastMessage(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  function promptLoginToSave(names: string[], targetDay: number) {
    pushToast({
      variant: "info",
      title: t.drawer.loginRequiredTitle,
      description: t.drawer.loginRequiredDesc,
      actionLabel: t.drawer.loginRequiredAction,
      action: () => {
        if (!activeVideo.videoId) {
          return;
        }
        savePendingVideoImport({
          videoId: activeVideo.videoId,
          selectedNames: names,
          targetDay,
        });
        router.push(`/login?callbackUrl=${encodeURIComponent("/?resumeVideoImport=1")}`);
      },
    });
  }

  function openImportDayPicker() {
    if (sessionStatus === "loading") {
      return;
    }
    if (sessionStatus !== "authenticated") {
      if (importCandidates.length === 0) {
        pushToast({
          variant: "warning",
          title: t.drawer.noLocationsToastTitle,
          description: t.drawer.noLocationsToastDesc,
        });
        return;
      }
      const names = importCandidates
        .map((loc) => loc.name)
        .filter((name) => selectedLocationNames.has(name));
      if (names.length === 0) {
        pushToast({
          variant: "warning",
          title: t.drawer.noLocationsToastTitle,
          description: t.drawer.selectAtLeastOneLocation,
        });
        return;
      }
      promptLoginToSave(names, importTargetDay);
      return;
    }
    if (importCandidates.length === 0) {
      pushToast({
        variant: "warning",
        title: t.drawer.noLocationsToastTitle,
        description: t.drawer.noLocationsToastDesc,
      });
      return;
    }
    const names = importCandidates
      .map((loc) => loc.name)
      .filter((name) => selectedLocationNames.has(name));
    if (names.length === 0) {
      pushToast({
        variant: "warning",
        title: t.drawer.noLocationsToastTitle,
        description: t.drawer.selectAtLeastOneLocation,
      });
      return;
    }
    setImportDayPickerOpen(true);
  }

  async function confirmImportToTrip() {
    const names = importCandidates
      .map((loc) => loc.name)
      .filter((name) => selectedLocationNames.has(name));
    if (names.length === 0) {
      setImportDayPickerOpen(false);
      return;
    }

    if (sessionStatus === "loading") {
      return;
    }
    if (sessionStatus !== "authenticated") {
      setImportDayPickerOpen(false);
      promptLoginToSave(names, importTargetDay);
      return;
    }

    try {
      setAdding(true);
      const added = await importVideoVerifiedPlacesToTrip(activeVideo, {
        selectedNames: names,
        targetDayNumber: importTargetDay,
      });
      if (added.addedItems === 0 || added.addedPins === 0) {
        pushToast({
          variant: "warning",
          title: t.drawer.noLocationsToastTitle,
          description: t.drawer.noLocationsToastDesc,
        });
        return;
      }

      setImportDayPickerOpen(false);
      showToastMessage(t.drawer.toastItinerary);
      onClose();
      router.push("/itinerary");
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
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
                      <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] tracking-wide text-foreground/80">
                        {t.video.mapsCatalog}
                      </span>
                    )}
                    {summaryDiagnostics.mapsProvenance === "google-geocoding" && (
                      <span className="rounded-full bg-tertiary/15 px-2 py-0.5 text-[10px] tracking-wide text-foreground/80">
                        {t.video.mapsGoogle}
                      </span>
                    )}
                    {summaryDiagnostics.mapsProvenance === "mixed" && (
                      <span className="rounded-full bg-tertiary/15 px-2 py-0.5 text-[10px] tracking-wide text-foreground/80">
                        {t.video.mapsMixed}
                      </span>
                    )}
                    {drawerSummarySourceLabel(summaryDiagnostics.summarySource) && (
                      <span className="rounded-full bg-border-light px-2 py-0.5 text-[10px] tracking-wide text-foreground/70">
                        {drawerSummarySourceLabel(summaryDiagnostics.summarySource)}
                      </span>
                    )}
                    {drawerSegmentSourceLabel(summaryDiagnostics.segmentSource) && (
                      <span className="rounded-full bg-border-light px-2 py-0.5 text-[10px] tracking-wide text-foreground/70">
                        {drawerSegmentSourceLabel(summaryDiagnostics.segmentSource)}
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

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-foreground/5 to-foreground/10">
                {videoId ? (
                  <YoutubeIframePlayer
                    key={videoId}
                    videoId={videoId}
                    seekToken={seekTarget.token}
                    seekSeconds={seekTarget.seconds}
                    className="absolute inset-0 h-full w-full"
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

                {!videoId && (
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
                  <h4 className="mb-3 text-sm font-semibold text-foreground">
                    {t.drawer.keySegments}
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {summaryDiagnostics?.summaryUnavailable ? (
                      <p className="text-sm text-muted">無法取得逐字稿，暫時無法產生精準片段。</p>
                    ) : activeVideo.summarySegments && activeVideo.summarySegments.length > 0 ? (
                      activeVideo.summarySegments.map((segment, segmentIndex) => (
                        <div
                          key={`${segment.id}_${segmentIndex}`}
                          data-testid="summary-segment"
                          className="rounded-xl bg-primary/5 px-3 py-3"
                        >
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              disabled={getSegmentSeekSeconds(segment) === null}
                              onClick={() => {
                                const sec = getSegmentSeekSeconds(segment);
                                if (sec !== null) {
                                  bumpSeek(sec);
                                }
                              }}
                              title={
                                getSegmentSeekSeconds(segment) === null
                                  ? t.drawer.jumpUnavailable
                                  : t.drawer.jumpToTimestamp
                              }
                              className="min-w-[52px] rounded-md bg-primary/10 px-2 py-0.5 text-center font-mono text-xs text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {segment.startLabel || segment.timestamp}
                            </button>
                            <div className="min-w-0 flex-1">
                              {segment.title && (
                                <p className="text-sm font-medium text-foreground">{segment.title}</p>
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
                            disabled={parseTimestampToSeconds(timestamp.time) <= 0}
                            onClick={() => {
                              const sec = parseTimestampToSeconds(timestamp.time);
                              if (sec > 0) {
                                bumpSeek(sec);
                              }
                            }}
                            title={t.drawer.jumpToTimestamp}
                            className="min-w-[52px] rounded-md bg-primary/10 px-2 py-0.5 text-center font-mono text-xs text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
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
                  {importCandidates.length > 0 && (
                    <p className="mb-3 text-[11px] text-muted">{t.drawer.importPickLocationsHint}</p>
                  )}
                  <div className="flex flex-col gap-2" data-testid="video-location-list">
                    {verifiedLocations.length > 0 ? (
                      verifiedLocations.map((location, locIdx) => {
                        const canImport = importCandidates.some((c) => c.name === location.name);
                        return (
                          <div
                            key={`${activeVideo.id}_loc_${locIdx}_${location.placeId ?? location.name}`}
                            className="flex items-start gap-3 rounded-xl border border-border-light bg-cream/50 px-3 py-2.5"
                            data-testid="video-location-item"
                          >
                            {canImport ? (
                              <input
                                type="checkbox"
                                className="mt-2 size-4 shrink-0 cursor-pointer accent-primary"
                                checked={selectedLocationNames.has(location.name)}
                                onChange={() => {
                                  setSelectedLocationNames((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(location.name)) {
                                      next.delete(location.name);
                                    } else {
                                      next.add(location.name);
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={t.drawer.toggleLocationImport.replace("{name}", location.name)}
                              />
                            ) : (
                              <span className="mt-2 size-4 shrink-0" aria-hidden />
                            )}
                            <div className="mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary/15">
                              <MapPin className="size-4 text-secondary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{location.name}</p>
                            </div>
                          </div>
                        );
                      })
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
                    onClick={() => openImportDayPicker()}
                    disabled={adding}
                    data-testid="video-add-to-itinerary-button"
                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-dark py-3 text-sm font-medium text-white transition-all hover:scale-[1.01] hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {adding ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t.drawer.applyToTripLoading}
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" />
                        {t.drawer.applyToTrip}
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

      <AnimatePresence>
        {open && importDayPickerOpen && (
          <motion.div
            key="video-import-day-overlay"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 p-4"
            onClick={() => {
              if (!adding) {
                setImportDayPickerOpen(false);
              }
            }}
          >
            <motion.div
              key="video-import-day-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="video-import-day-dialog-title"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              data-testid="video-import-day-dialog"
              className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="video-import-day-dialog-title" className="text-base font-semibold text-foreground">
                {t.drawer.importPickDayDialogTitle}
              </h2>
              <div className="mt-4 flex flex-col gap-2">
                <label htmlFor="video-import-day-dialog-select" className="text-sm font-medium text-foreground">
                  {t.drawer.importTargetDay}
                </label>
                <select
                  id="video-import-day-dialog-select"
                  data-testid="video-import-day-select"
                  value={importTargetDay}
                  onChange={(event) => setImportTargetDay(Number.parseInt(event.target.value, 10))}
                  disabled={adding}
                  className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
                >
                  {(tripItinerary.length > 0
                    ? tripItinerary
                    : [{ dayNumber: 1, theme: "", summary: "", items: [] }]
                  ).map((day) => (
                    <option key={day.dayNumber} value={day.dayNumber}>
                      {t.drawer.importDayOption.replace("{n}", String(day.dayNumber))}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => setImportDayPickerOpen(false)}
                  className="rounded-xl border border-border-light px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-border-light disabled:opacity-50"
                >
                  {t.drawer.importPickDayDialogCancel}
                </button>
                <button
                  type="button"
                  data-testid="video-import-day-confirm-button"
                  disabled={adding}
                  onClick={() => void confirmImportToTrip()}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  {adding ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {t.drawer.applyToTripLoading}
                    </span>
                  ) : (
                    t.drawer.importPickDayDialogConfirm
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
