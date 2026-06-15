"use client";

import { useCallback, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { addPlaceToItinerary } from "@/lib/addPlaceToItinerary";
import { createTripItemId } from "@/lib/tripItemIds";
import { cn } from "@/lib/utils";
import PlaceThumbnail from "@/components/map/PlaceThumbnail";
import { usePendingPoiPreview } from "@/hooks/usePendingPoiPreview";
import { zhTW as t } from "@/locales/zh-TW";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";

type MapPoiAddCardProps = {
  defaultDayNumber: number;
  tripDestination: string;
  onAdded?: (dayNumber: number) => void;
  className?: string;
};

export default function MapPoiAddCard({
  defaultDayNumber,
  tripDestination,
  onAdded,
  className,
}: MapPoiAddCardProps) {
  const pushToast = useToastStore((state) => state.pushToast);
  const setPreferredPoiDay = useMapStore((state) => state.setPreferredPoiDay);
  const [submitting, setSubmitting] = useState(false);

  const {
    pendingPoi,
    preview,
    loading,
    error,
    dayNumber,
    setDayNumber,
    dayOptions,
    isDuplicate,
    showAddUi,
    dismiss,
  } = usePendingPoiPreview({ tripDestination, defaultDayNumber });

  const handleConfirm = useCallback(async () => {
    if (!preview || !pendingPoi || submitting || isDuplicate) {
      return;
    }
    setSubmitting(true);
    try {
      const itemId = createTripItemId("poi");
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
      setPreferredPoiDay(dayNumber);
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
    setPreferredPoiDay,
    submitting,
  ]);

  if (!pendingPoi || !showAddUi) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-b-2 border-primary/25 bg-primary/5 px-5 py-4",
        className,
      )}
    >
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
        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" />
          {t.map.poiAddLoading}
        </div>
      ) : error ? (
        <p className="mt-3 text-sm text-danger">{error}</p>
      ) : preview ? (
        <>
          <PlaceThumbnail
            src={preview.thumbnail || preview.photoUrl}
            placeId={preview.placeId}
            alt={t.map.infoThumbnail}
            placeholder={t.map.infoThumbnail}
            className="mt-3 rounded-xl"
          />
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
  );
}
