"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, MapPin, X } from "lucide-react";
import { AnimatePresence, m } from "@/lib/motion";
import { addPlaceToItinerary, itineraryHasPlaceId } from "@/lib/addPlaceToItinerary";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { zhTW as t } from "@/locales/zh-TW";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { ApiResponse, LocationReference } from "@/types";

type PlaceDetailsRow = {
  id?: string;
  name?: string;
  placeId?: string;
  details?: Partial<LocationReference>;
};

type MapPoiAddSheetProps = {
  defaultDayNumber: number;
  tripDestination: string;
  onAdded?: (dayNumber: number) => void;
};

export default function MapPoiAddSheet({
  defaultDayNumber,
  tripDestination,
  onAdded,
}: MapPoiAddSheetProps) {
  const { status } = useSession();
  const pendingPoi = useMapStore((state) => state.pendingPoi);
  const setPendingPoi = useMapStore((state) => state.setPendingPoi);
  const itinerary = useTripStore((state) => state.itinerary);
  const pushToast = useToastStore((state) => state.pushToast);
  const manualItemCounter = useRef(0);

  const [dayNumber, setDayNumber] = useState(defaultDayNumber);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<LocationReference | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dayOptions = itinerary.map((day) => day.dayNumber);
  const isDuplicate =
    Boolean(pendingPoi?.placeId) && itineraryHasPlaceId(itinerary, pendingPoi!.placeId);

  const dismiss = useCallback(() => {
    setPendingPoi(null);
    setPreview(null);
    setError(null);
    setLoading(false);
    setSubmitting(false);
  }, [setPendingPoi]);

  useEffect(() => {
    if (!pendingPoi) {
      setPreview(null);
      setError(null);
      return;
    }
    setDayNumber(defaultDayNumber);
    if (status === "unauthenticated") {
      pushToast({
        variant: "error",
        title: t.map.poiAddTitle,
        description: t.map.poiAddLoginRequired,
      });
      dismiss();
      return;
    }
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);

    void fetch("/api/map/place-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        region: tripDestination,
        places: [
          {
            id: pendingPoi.placeId,
            placeId: pendingPoi.placeId,
            lat: pendingPoi.lat,
            lng: pendingPoi.lng,
          },
        ],
      }),
    })
      .then((response) => response.json() as Promise<ApiResponse<{ results: PlaceDetailsRow[] }>>)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        if (!payload.success) {
          throw new Error(payload.error.message);
        }
        const row = payload.data.results[0];
        const details = row?.details ?? {};
        const location: LocationReference = {
          name: details.name || row?.name || t.map.poiAddTitle,
          lat: details.lat ?? pendingPoi.lat ?? 0,
          lng: details.lng ?? pendingPoi.lng ?? 0,
          description: details.description ?? details.address,
          address: details.address,
          placeId: pendingPoi.placeId,
          photoUrl: details.photoUrl,
          thumbnail: details.thumbnail ?? details.photoUrl,
          openingHours: details.openingHours,
          phoneNumber: details.phoneNumber,
          website: details.website,
          googleMapsUrl: details.googleMapsUrl,
          rating: details.rating,
          userRatingsTotal: details.userRatingsTotal,
          resolvedFrom: "google-place-details",
          verified: details.verified ?? true,
        };
        if (!hasUsableMapCoordinate(location)) {
          throw new Error(t.map.poiAddLoadFailed);
        }
        setPreview(location);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        const message =
          fetchError instanceof Error ? fetchError.message : t.map.poiAddLoadFailed;
        setError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [defaultDayNumber, dismiss, pendingPoi, pushToast, status, tripDestination]);

  const handleConfirm = useCallback(async () => {
    if (!preview || !pendingPoi || submitting || isDuplicate) {
      return;
    }
    setSubmitting(true);
    try {
      manualItemCounter.current += 1;
      const itemId = `poi_${dayNumber}_${manualItemCounter.current}`;
      addPlaceToItinerary({
        dayNumber,
        itemId,
        location: preview,
        title: preview.name,
        notes: preview.address ?? preview.description,
      });
      pushToast({
        variant: "success",
        title: t.map.poiAddTitle,
        description: t.map.poiAddSuccess.replace("{name}", preview.name),
      });
      useMapStore.getState().setPreferredPoiDay(dayNumber);
      onAdded?.(dayNumber);
      dismiss();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : t.map.poiAddLoadFailed;
      pushToast({
        variant: "error",
        title: t.map.poiAddTitle,
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    dayNumber,
    dismiss,
    isDuplicate,
    onAdded,
    pendingPoi,
    preview,
    pushToast,
    submitting,
  ]);

  return (
    <AnimatePresence>
      {pendingPoi ? (
        <m.div
          key="map-poi-add-sheet"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="pointer-events-none fixed bottom-24 left-1/2 z-[25] flex w-[min(92vw,28rem)] -translate-x-1/2 justify-center px-3"
        >
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border-2 border-primary/25 bg-surface p-4 shadow-soft-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-primary" />
                <p className="text-sm font-semibold text-foreground">{t.map.poiAddTitle}</p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg p-1 text-muted hover:bg-muted/10 hover:text-foreground"
                aria-label={t.map.poiAddCancel}
              >
                <X className="size-4" />
              </button>
            </div>

            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                <Loader2 className="size-4 animate-spin" />
                {t.map.poiAddLoading}
              </div>
            ) : error ? (
              <p className="mt-3 text-sm text-danger">{error}</p>
            ) : preview ? (
              <>
                <p className="mt-2 text-sm font-medium text-foreground">{preview.name}</p>
                {preview.address ? (
                  <p className="mt-1 text-xs text-muted">{preview.address}</p>
                ) : null}
                {typeof preview.rating === "number" ? (
                  <p className="mt-1 text-xs text-muted">
                    {t.map.poiAddRating.replace("{rating}", String(preview.rating))}
                    {preview.userRatingsTotal
                      ? ` (${preview.userRatingsTotal.toLocaleString()})`
                      : ""}
                  </p>
                ) : null}

                {isDuplicate ? (
                  <p className="mt-3 text-sm text-amber-700">{t.map.poiAddDuplicate}</p>
                ) : (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-muted">{t.map.poiAddDayLabel}</label>
                    <select
                      value={dayNumber}
                      onChange={(event) => setDayNumber(Number(event.target.value))}
                      className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                    >
                      {(dayOptions.length > 0 ? dayOptions : [defaultDayNumber]).map((day) => (
                        <option key={day} value={day}>
                          {t.map.dayPrefix}
                          {day}
                          {t.map.daySuffix}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/10"
              >
                {t.map.poiAddCancel}
              </button>
              <button
                type="button"
                disabled={loading || submitting || !preview || isDuplicate}
                onClick={() => void handleConfirm()}
                className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? t.map.poiAddSubmitting : t.map.poiAddConfirm}
              </button>
            </div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
