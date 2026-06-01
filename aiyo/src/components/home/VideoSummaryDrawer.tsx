"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, m } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { Video } from "@/types";
import type { MapPin as TripMapPin } from "@/types";
import { cn } from "@/lib/utils";
import { getSegmentSeekSeconds, parseTimestampToSeconds } from "@/lib/videoTimestamp";
import { buildYoutubeWatchUrl } from "@/lib/youtubeWatchUrl";
import {
  clearPendingVideoImport,
  readPendingVideoImport,
  savePendingVideoImport,
} from "@/lib/pendingVideoImport";
import { zhTW as t } from "@/locales/zh-TW";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import {
  getVideoImportCandidateLocations,
  importVideoVerifiedPlacesToTrip,
} from "@/services/videoPlaceImport";
import { createNewTrip, listTripsForLibrary, setActiveTrip } from "@/services/itineraryClient";
import { syncService } from "@/services/syncService";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useVideoStore, type SummaryDiagnostics, type VideoState } from "@/stores/useVideoStore";
import YoutubeIframePlayer from "@/components/home/YoutubeIframePlayer";
import PlanningWaitGame from "@/components/chat/PlanningWaitGame";

type PreviewMapProps = {
  pins: TripMapPin[];
  selectedPinId?: string | null;
  className?: string;
};

const PreviewMap = dynamic<PreviewMapProps>(() => import("@/components/map/PublicItineraryMap"), {
  ssr: false,
});

interface VideoSummaryDrawerProps {
  video: Video | null;
  open: boolean;
  onClose: () => void;
  /** 清除伺服端已存摘要並重新跑摘要／AI 管線（首頁／聊天由父層實作） */
  onRefreshSummary?: () => void | Promise<void>;
}

const NEW_TRIP_OPTION = "__new_trip__";
const PREVIEW_PIN_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#84cc16",
];

function inferDestinationFromVideoImport(video: Video, names: string[]) {
  const fromLocations = video.extractedLocations
    .map((location) => location.address || location.description || "")
    .join(" ");
  const combined = `${video.title} ${fromLocations}`;
  const cityMatch = combined.match(/([\p{Script=Han}]{2,4}(?:市|縣))/u);
  if (cityMatch?.[1]) {
    return cityMatch[1];
  }
  return names[0] || "";
}

function buildImportedTripTitle(video: Video, destination: string, names: string[]) {
  if (destination) {
    return `${destination} 影片行程`;
  }
  if (names[0]) {
    return `${names[0]} 影片行程`;
  }
  return video.title ? `${video.title.slice(0, 24)} 行程` : "影片行程";
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
    case "deterministic-mentions-json-polished":
      return t.drawer.sourceSegmentsMentionsPolished;
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
  onRefreshSummary,
}: VideoSummaryDrawerProps) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const summaryDiagnostics = useVideoStore((state: VideoState) => state.summaryDiagnostics);
  const isSummarizing = useVideoStore((state: VideoState) => state.isSummarizing);
  const pushToast = useToastStore((state) => state.pushToast);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [failedImageVideoId, setFailedImageVideoId] = useState<string | null>(null);
  const [seekTarget, setSeekTarget] = useState({ token: 0, seconds: 0 });
  const [selectedLocationNames, setSelectedLocationNames] = useState<Set<string>>(() => new Set());
  const [selectedPreviewLocationName, setSelectedPreviewLocationName] = useState<string | null>(null);
  const [importTargetTripId, setImportTargetTripId] = useState<string>("");
  const [importTargetDay, setImportTargetDay] = useState(1);
  const [importExtraDays, setImportExtraDays] = useState(0);
  const [importNewTripTitle, setImportNewTripTitle] = useState("");
  const [importDayPickerOpen, setImportDayPickerOpen] = useState(false);
  const [importTripList, setImportTripList] = useState<ItineraryListItem[]>([]);
  const [importTripListLoading, setImportTripListLoading] = useState(false);
  const [importTripListError, setImportTripListError] = useState<string | null>(null);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const currentTripId = useTripStore((state) => state.tripId);
  const currentTripTitle = useTripStore((state) => state.title);
  const currentTripDestination = useTripStore((state) => state.destination);
  const currentTripDays = useTripStore((state) => state.days);
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
      setImportTargetTripId(useTripStore.getState().tripId || NEW_TRIP_OPTION);
      setSelectedPreviewLocationName(null);
      setImportNewTripTitle(buildImportedTripTitle(video, inferDestinationFromVideoImport(video, names), names));
      setImportExtraDays(0);
      clearPendingVideoImport();
    } else {
      setSelectedLocationNames(new Set(candidates.map((loc) => loc.name)));
      setSelectedPreviewLocationName(null);
      const firstDay = useTripStore.getState().itinerary[0]?.dayNumber ?? 1;
      setImportTargetDay(firstDay);
      setImportTargetTripId(useTripStore.getState().tripId || NEW_TRIP_OPTION);
      const defaultNames = candidates.map((loc) => loc.name);
      setImportNewTripTitle(
        buildImportedTripTitle(video, inferDestinationFromVideoImport(video, defaultNames), defaultNames),
      );
      setImportExtraDays(0);
    }
  }, [open, video?.id, video]);

  useEffect(() => {
    if (!open) {
      setImportDayPickerOpen(false);
      setImportExtraDays(0);
    }
  }, [open]);

  useEffect(() => {
    if (!importDayPickerOpen || sessionStatus !== "authenticated") {
      return;
    }
    let cancelled = false;
    setImportTripListLoading(true);
    setImportTripListError(null);
    listTripsForLibrary("recent")
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setImportTripList(rows);
        const fallbackTripId = currentTripId || rows[0]?.id || NEW_TRIP_OPTION;
        setImportTargetTripId((current) =>
          current === NEW_TRIP_OPTION ||
          rows.some((row) => row.id === current) ||
          current === currentTripId
            ? current
            : fallbackTripId,
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setImportTripListError(error instanceof Error ? error.message : t.drawer.importTripListFailed);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setImportTripListLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentTripId, importDayPickerOpen, sessionStatus]);

  const importTripOptions = useMemo(() => {
    const rows = [...importTripList];
    if (currentTripId && !rows.some((row) => row.id === currentTripId)) {
      rows.unshift({
        id: currentTripId,
        title: currentTripTitle || currentTripDestination || t.drawer.currentTripFallback,
        destination: currentTripDestination || t.common.notSet,
        days: Math.max(1, currentTripDays || tripItinerary.length || 1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isOwner: true,
      });
    }
    return rows;
  }, [currentTripDestination, currentTripDays, currentTripId, currentTripTitle, importTripList, tripItinerary.length]);

  const selectedImportTrip = useMemo(
    () => importTripOptions.find((trip) => trip.id === importTargetTripId) || null,
    [importTargetTripId, importTripOptions],
  );

  const importBaseDayCount = useMemo(() => {
    if (importTargetTripId === NEW_TRIP_OPTION) {
      return 1;
    }
    if (importTargetTripId && importTargetTripId === currentTripId && tripItinerary.length > 0) {
      return Math.max(...tripItinerary.map((day) => day.dayNumber));
    }
    return Math.max(1, selectedImportTrip?.days || currentTripDays || 1);
  }, [
    currentTripDays,
    currentTripId,
    importTargetTripId,
    selectedImportTrip?.days,
    tripItinerary,
  ]);

  const importDayOptions = useMemo(() => {
    const count = Math.max(1, importBaseDayCount + importExtraDays);
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [importBaseDayCount, importExtraDays]);

  const canConfirmImport =
    importTargetTripId === NEW_TRIP_OPTION || Boolean(importTargetTripId);

  useEffect(() => {
    if (!importDayPickerOpen || importDayOptions.includes(importTargetDay)) {
      return;
    }
    setImportTargetDay(importDayOptions[0] ?? 1);
  }, [importDayOptions, importDayPickerOpen, importTargetDay]);

  const verifiedLocations = video?.extractedLocations ?? [];
  const previewPins = useMemo<TripMapPin[]>(
    () =>
      verifiedLocations
        .filter((location) => Number.isFinite(location.lat) && Number.isFinite(location.lng))
        .map((location, index) => ({
          id: `preview_${index}_${location.placeId ?? location.name}`,
          name: location.name,
          description: location.address ?? location.name,
          lat: location.lat as number,
          lng: location.lng as number,
          color: PREVIEW_PIN_COLORS[index % PREVIEW_PIN_COLORS.length]!,
        })),
    [verifiedLocations],
  );
  const selectedPreviewPinId = useMemo(
    () => previewPins.find((pin) => pin.name === selectedPreviewLocationName)?.id ?? null,
    [previewPins, selectedPreviewLocationName],
  );

  if (!video) {
    return null;
  }

  const activeVideo = video;
  const imageFailed = failedImageVideoId === activeVideo.id;
  const isProcessingVideo =
    isSummarizing &&
    !summaryDiagnostics?.summaryUnavailable &&
    ((activeVideo.summarySegments || []).length === 0 || activeVideo.extractedLocations.length === 0);
  const drawerProcessingWaitKey = isProcessingVideo ? `drawer-processing:${videoId || activeVideo.id}` : null;

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
    setImportExtraDays(0);
    if (!importTargetTripId) {
      setImportTargetTripId(currentTripId || NEW_TRIP_OPTION);
    }
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
      let targetDayNumber = importTargetDay;
      const targetTripId = importTargetTripId || currentTripId;
      const creatingNewTrip = !targetTripId || targetTripId === NEW_TRIP_OPTION;
      if (creatingNewTrip) {
        const inferredDestination = inferDestinationFromVideoImport(activeVideo, names);
        const normalizedTitle = importNewTripTitle.trim() || buildImportedTripTitle(activeVideo, inferredDestination, names);
        const created = await createNewTrip({
          title: normalizedTitle,
          destination: inferredDestination,
          days: 1,
          coverImageUrl: activeVideo.thumbnail || null,
        });
        const snapshot = await setActiveTrip(created.tripId);
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      } else if (targetTripId !== currentTripId) {
        const snapshot = await setActiveTrip(targetTripId);
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
        const availableDays = snapshot.trip.itinerary.map((day) => day.dayNumber);
        targetDayNumber = availableDays.includes(importTargetDay)
          ? importTargetDay
          : (availableDays[0] ?? importTargetDay);
      }
      const added = await importVideoVerifiedPlacesToTrip(activeVideo, {
        selectedNames: names,
        targetDayNumber,
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
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose();
          }
        }}
      >
        <DialogContent
          data-testid="video-summary-drawer"
          showCloseButton={false}
          className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none sm:max-w-3xl"
        >
            <div
              className="flex h-full min-h-0 flex-col"
              onPointerDown={(event) => {
                if (!selectedPreviewLocationName) {
                  return;
                }
                const target = event.target as HTMLElement | null;
                if (!target) {
                  return;
                }
                if (target.closest("[data-map-preview-card]")) {
                  return;
                }
                if (target.closest('[data-testid="video-location-item"]')) {
                  return;
                }
                setSelectedPreviewLocationName(null);
              }}
            >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface shadow-soft-lg">
            <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
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
                {onRefreshSummary && videoId ? (
                  <button
                    type="button"
                    title={t.drawer.refreshSummaryTitle}
                    aria-label={t.drawer.refreshSummaryAria}
                    disabled={isSummarizing || refreshingSummary}
                    onClick={() => {
                      void (async () => {
                        setRefreshingSummary(true);
                        try {
                          await onRefreshSummary();
                        } finally {
                          setRefreshingSummary(false);
                        }
                      })();
                    }}
                    className="mt-0.5 shrink-0 cursor-pointer rounded-full p-2 text-muted transition-colors hover:bg-border-light hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <RefreshCw
                      className={cn(
                        "size-4",
                        (isSummarizing || refreshingSummary) && "animate-spin",
                      )}
                      aria-hidden
                    />
                  </button>
                ) : null}
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
                      activeVideo.summarySegments.map((segment, segmentIndex) => {
                        const seekSec = getSegmentSeekSeconds(segment);
                        const hintList = Array.from(
                          new Set((segment.locationHints ?? []).map((h) => h.trim()).filter(Boolean)),
                        );
                        const snippet =
                          segment.summary?.trim() ||
                          segment.highlights?.find((h) => h.trim())?.trim() ||
                          segment.text?.trim();
                        const segmentYoutubeHref =
                          activeVideo.videoId && seekSec !== null
                            ? buildYoutubeWatchUrl(activeVideo.videoId, seekSec)
                            : null;
                        return (
                          <div
                            key={`${segment.id}_${segmentIndex}`}
                            data-testid="summary-segment"
                            className="rounded-xl bg-primary/5 px-3 py-3"
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                disabled={seekSec === null}
                                onClick={() => {
                                  if (seekSec !== null) {
                                    bumpSeek(seekSec);
                                  }
                                }}
                                title={
                                  seekSec === null ? t.drawer.jumpUnavailable : t.drawer.jumpToTimestamp
                                }
                                className="min-w-[52px] rounded-md bg-primary/10 px-2 py-0.5 text-center font-mono text-xs text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {segment.startLabel || segment.timestamp}
                              </button>
                              <div className="min-w-0 flex-1 space-y-2">
                                {segment.title ? (
                                  <p className="text-sm font-medium text-foreground">{segment.title}</p>
                                ) : null}
                                {hintList.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {hintList.map((name) => (
                                      <span
                                        key={`${segment.id}_${name}`}
                                        className="inline-flex items-center gap-0.5 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/15"
                                      >
                                        <MapPin className="size-3 shrink-0 opacity-80" aria-hidden />
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {snippet ? (
                                  <p className="text-xs leading-relaxed text-muted">{snippet}</p>
                                ) : null}
                                {segmentYoutubeHref ? (
                                  <a
                                    href={segmentYoutubeHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  >
                                    {t.drawer.openSegmentOnYoutube}
                                    <ExternalLink className="size-3" aria-hidden />
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })
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
                              className={cn(
                                "flex items-start gap-3 rounded-xl border border-border-light bg-cream/50 px-3 py-2.5",
                                selectedPreviewLocationName === location.name && "border-primary/50 bg-primary/5",
                              )}
                              data-testid="video-location-item"
                              onClick={() => setSelectedPreviewLocationName(location.name)}
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
                              <div
                                className="mt-0.5 flex size-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                                style={{
                                  backgroundColor:
                                    PREVIEW_PIN_COLORS[locIdx % PREVIEW_PIN_COLORS.length] ?? "#6366f1",
                                }}
                              >
                                {locIdx + 1}
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
                        <p className="text-sm text-muted">{t.drawer.noExtractedLocations}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-sm font-semibold text-foreground">{t.drawer.extractedFoods}</h4>
                  <div className="flex flex-col gap-2">
                    {activeVideo.extractedFoods && activeVideo.extractedFoods.length > 0 ? (
                      activeVideo.extractedFoods.map((food, index) => (
                        <div
                          key={`${activeVideo.id}_food_${index}_${food}`}
                          className="rounded-xl border border-border-light bg-cream/50 px-3 py-2.5"
                        >
                          <p className="text-sm font-medium text-foreground">{food}</p>
                        </div>
                      ))
                    ) : isProcessingVideo ? (
                      <ProcessingRow label={t.drawer.videoProcessing} />
                    ) : (
                      <p className="text-sm text-muted">{t.drawer.noExtractedFoods}</p>
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
            </div>
            <div className="pointer-events-none absolute left-[calc(100%+16px)] top-[430px] hidden w-[360px] lg:block">
              {selectedPreviewLocationName ? (
                <div
                  data-map-preview-card
                  className="pointer-events-auto h-[360px] w-[360px] overflow-hidden rounded-2xl border border-border-light bg-surface shadow-soft-lg"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <PreviewMap
                    pins={previewPins}
                    selectedPinId={selectedPreviewPinId}
                    className="h-full min-h-[260px]"
                  />
                </div>
              ) : null}
            </div>
            </div>
        </DialogContent>
      </Dialog>

      {open && toast && (
        <m.div
          initial={{ opacity: 0, y: 20, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          className="fixed bottom-8 left-1/2 z-[60] flex items-center gap-2 rounded-2xl bg-foreground px-5 py-3 text-sm font-medium text-white shadow-lg"
        >
          <Check className="size-4 text-tertiary" />
          {toast}
        </m.div>
      )}

      <Dialog
        open={open && importDayPickerOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !adding) {
            setImportDayPickerOpen(false);
          }
        }}
      >
        <DialogContent
          data-testid="video-import-day-dialog"
          showCloseButton={!adding}
          className="rounded-2xl border-border-light bg-surface shadow-soft-lg sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle id="video-import-day-dialog-title" className="text-base font-semibold">
              {t.drawer.importPickDayDialogTitle}
            </DialogTitle>
          </DialogHeader>
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="video-import-trip-dialog-select" className="text-sm font-medium text-foreground">
                    {t.drawer.importTargetTrip}
                  </label>
                  <select
                    id="video-import-trip-dialog-select"
                    data-testid="video-import-trip-select"
                    value={importTargetTripId}
                    onChange={(event) => {
                      const nextTripId = event.target.value;
                      setImportTargetTripId(nextTripId);
                      if (nextTripId === NEW_TRIP_OPTION && !importNewTripTitle.trim()) {
                        const selectedNames = importCandidates
                          .map((loc) => loc.name)
                          .filter((name) => selectedLocationNames.has(name));
                        const names = selectedNames.length > 0 ? selectedNames : importCandidates.map((loc) => loc.name);
                        const destination = inferDestinationFromVideoImport(activeVideo, names);
                        setImportNewTripTitle(buildImportedTripTitle(activeVideo, destination, names));
                      }
                      setImportExtraDays(0);
                      setImportTargetDay(1);
                    }}
                    disabled={adding || importTripListLoading}
                    className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
                  >
                    <option value={NEW_TRIP_OPTION}>{t.drawer.importNewTripOption}</option>
                    {importTripOptions.map((trip) => (
                      <option key={trip.id} value={trip.id}>
                        {trip.title || trip.destination || t.drawer.currentTripFallback}
                        {trip.isOwner === false ? ` · ${t.drawer.importSharedTripLabel}` : ""}
                      </option>
                    ))}
                  </select>
                  {importTripListLoading && (
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                      {t.drawer.importTripListLoading}
                    </p>
                  )}
                  {importTripListError && (
                    <p className="text-xs text-danger">{importTripListError}</p>
                  )}
                  {importTargetTripId === NEW_TRIP_OPTION ? (
                    <div className="mt-2 flex flex-col gap-2">
                      <label htmlFor="video-import-new-trip-title" className="text-sm font-medium text-foreground">
                        新行程名稱
                      </label>
                      <input
                        id="video-import-new-trip-title"
                        data-testid="video-import-new-trip-title"
                        type="text"
                        value={importNewTripTitle}
                        onChange={(event) => setImportNewTripTitle(event.target.value)}
                        disabled={adding}
                        placeholder="例如：熊本兩天美食散步"
                        className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                <label htmlFor="video-import-day-dialog-select" className="text-sm font-medium text-foreground">
                  {t.drawer.importTargetDay}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                <select
                  id="video-import-day-dialog-select"
                  data-testid="video-import-day-select"
                  value={importTargetDay}
                  onChange={(event) => setImportTargetDay(Number.parseInt(event.target.value, 10))}
                  disabled={adding || importTripListLoading || importDayOptions.length === 0}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
                >
                  {importDayOptions.map((dayNumber) => (
                    <option key={dayNumber} value={dayNumber}>
                      {t.drawer.importDayOption.replace("{n}", String(dayNumber))}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="video-import-add-day-button"
                  disabled={adding || importTripListLoading}
                  onClick={() => {
                    setImportExtraDays((current) => current + 1);
                    setImportTargetDay((current) => current + 1);
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-light bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-cream/60 disabled:opacity-50"
                >
                  <Plus className="size-4" aria-hidden />
                  {t.drawer.importAddDay}
                </button>
                </div>
                </div>
              </div>
          <DialogFooter className="gap-2 border-0 bg-transparent p-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={adding}
              onClick={() => setImportDayPickerOpen(false)}
              className="rounded-xl border-border-light"
            >
              {t.drawer.importPickDayDialogCancel}
            </Button>
            <Button
              type="button"
              data-testid="video-import-day-confirm-button"
              disabled={adding || importTripListLoading || !canConfirmImport}
              onClick={() => void confirmImportToTrip()}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary-dark"
            >
              {adding ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t.drawer.applyToTripLoading}
                </span>
              ) : (
                t.drawer.importPickDayDialogConfirm
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlanningWaitGame
        isWaiting={open && isProcessingVideo}
        waitKey={drawerProcessingWaitKey}
        planningComplete={open ? !isProcessingVideo : false}
        promptDelayMs={3000}
        promptTitle="影片摘要處理中，先玩個小遊戲吧！"
        gameDescription="正在整理影片重點與地點資訊，先玩小遊戲打發等待時間。"
        completionTitle="影片摘要處理完成！"
        completionDescription="重點片段與地點資訊已更新。"
      />
    </>
  );
}
