"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { zhTW as t } from "@/locales/zh-TW";
import { ApiRequestError } from "@/services/apiClient";
import { setActiveTrip } from "@/services/itineraryClient";
import { syncService } from "@/services/syncService";
import { useMapStore } from "@/stores/useMapStore";
import { cn } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="min-h-0 flex-1 rounded-2xl border-2 border-border bg-surface" />,
});
const ItineraryPanel = dynamic(() => import("@/components/map/ItineraryPanel"), { ssr: false });
const FloatingAIChat = dynamic(() => import("@/components/map/FloatingAIChat"), { ssr: false });
const VoicePlanningButton = dynamic(() => import("@/components/map/VoicePlanningButton"), { ssr: false });

export default function TripByIdPage() {
  const params = useParams();
  const router = useRouter();
  const { status } = useSession();
  const tripId = useMemo(() => {
    const raw = params?.id;
    if (typeof raw === "string") {
      return raw;
    }
    if (Array.isArray(raw)) {
      return raw[0] ?? "";
    }
    return "";
  }, [params]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [tripLoading, setTripLoading] = useState(true);
  const { panelOpen, setPanelOpen } = useMapStore();

  useEffect(() => {
    if (!tripId) {
      setLoadError(t.tripMapPage.invalidId);
      setTripLoading(false);
      return;
    }

    if (status === "loading") {
      return;
    }

    if (status !== "authenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/trip/${tripId}`)}`);
      return;
    }

    let cancelled = false;
    setLoadError(null);
    setTripLoading(true);

    void (async () => {
      try {
        const snapshot = await setActiveTrip(tripId);
        if (cancelled) {
          return;
        }
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
        setPanelOpen(true);
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiRequestError) {
            if (e.code === "not_found") {
              setLoadError(t.tripMapPage.tripNotFound);
            } else if (e.code === "forbidden") {
              setLoadError(t.tripMapPage.tripForbidden);
            } else {
              setLoadError(e.message || t.tripMapPage.loadFailed);
            }
          } else {
            setLoadError(e instanceof Error ? e.message : t.tripMapPage.loadFailed);
          }
        }
      } finally {
        if (!cancelled) {
          setTripLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId, status, router, setPanelOpen]);

  if (!tripLoading && loadError) {
    return (
      <div
        className="relative flex h-[100dvh] max-lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 w-full flex-col items-center justify-center gap-6 overflow-hidden bg-background px-6 text-center"
        data-testid="trip-map-page"
      >
        <p className="max-w-md text-sm font-medium text-danger">{loadError}</p>
        <Link
          href="/itinerary"
          className="rounded-xl border-2 border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
        >
          {t.tripMapPage.backToItinerary}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-[100dvh] max-lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 w-full flex-col overflow-hidden bg-background"
      data-testid="trip-map-page"
    >
      {tripLoading && (
        <div
          className={cn(
            "absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/85 px-6 text-center backdrop-blur-sm",
          )}
        >
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-medium text-foreground">{t.tripMapPage.loadingTitle}</p>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col p-3 sm:p-4">
        <MapView />
      </div>

      <ItineraryPanel />

      {!panelOpen && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="absolute top-4 right-4 z-20 flex cursor-pointer items-center gap-2 rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-soft-lg transition-colors hover:border-primary/40 hover:bg-surface-elevated"
        >
          {t.mapPage.openItineraryPanel}
        </button>
      )}

      <Link
        href="/itinerary"
        className={cn(
          "absolute bottom-6 left-4 z-20 flex items-center gap-2 rounded-xl border-2 border-border bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-soft-lg transition-colors hover:border-primary/40 hover:bg-surface-elevated max-lg:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]",
        )}
        aria-label={t.tripMapPage.backToItineraryAria}
      >
        <ArrowLeft className="size-4 text-primary" aria-hidden />
        {t.tripMapPage.backToItinerary}
      </Link>

      <VoicePlanningButton />
      <FloatingAIChat />
    </div>
  );
}
