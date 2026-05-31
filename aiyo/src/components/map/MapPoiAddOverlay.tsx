"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Plus, X } from "lucide-react";
import { addPlaceToItinerary } from "@/lib/addPlaceToItinerary";
import { createTripItemId } from "@/lib/tripItemIds";
import { pendingPoiKey, usePendingPoiPreview } from "@/hooks/usePendingPoiPreview";
import { zhTW as t } from "@/locales/zh-TW";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import type { LocationReference } from "@/types";

type GoogleMapInstance = {
  addListener?: (event: string, handler: () => void) => { remove?: () => void };
};

type MapPoiAddOverlayProps = {
  map: GoogleMapInstance | null;
  mapReady: boolean;
  tripDestination: string;
  onMapClickSuppress?: () => void;
};

type OverlayContentProps = {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  preview: LocationReference | null;
  loading: boolean;
  error: string | null;
  dayNumber: number;
  setDayNumber: (day: number) => void;
  dayOptions: number[];
  defaultDayNumber: number;
  isDuplicate: boolean;
  dismiss: () => void;
  onMapClickSuppress?: () => void;
};

function MapPoiAddOverlayContent({
  menuOpen,
  setMenuOpen,
  preview,
  loading,
  error,
  dayNumber,
  setDayNumber,
  dayOptions,
  defaultDayNumber,
  isDuplicate,
  dismiss,
  onMapClickSuppress,
}: OverlayContentProps) {
  const pushToast = useToastStore((state) => state.pushToast);
  const setPreferredPoiDay = useMapStore((state) => state.setPreferredPoiDay);
  const pendingPoi = useMapStore((state) => state.pendingPoi);
  const [submitting, setSubmitting] = useState(false);

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
    pendingPoi,
    preview,
    pushToast,
    setPreferredPoiDay,
    submitting,
  ]);

  const stopMapClick = (event: React.MouseEvent | React.PointerEvent) => {
    event.stopPropagation();
    onMapClickSuppress?.();
  };

  if (!pendingPoi) {
    return null;
  }

  return (
    <div
      className="pointer-events-auto"
      onMouseDown={stopMapClick}
      onClick={stopMapClick}
    >
      {!menuOpen ? (
        <button
          type="button"
          aria-label={t.map.poiAddMapButton}
          title={preview?.name ?? t.map.poiAddMapButton}
          onClick={() => setMenuOpen(true)}
          className="flex size-9 items-center justify-center rounded-full border-2 border-white bg-primary text-white shadow-lg transition-transform hover:scale-105"
        >
          <Plus className="size-4" strokeWidth={2.5} />
        </button>
      ) : (
        <div className="w-[min(220px,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-3 shadow-soft-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{t.map.poiAddTitle}</p>
            <button
              type="button"
              aria-label={t.map.poiAddCancel}
              onClick={() => {
                setMenuOpen(false);
                dismiss();
              }}
              className="rounded-md p-0.5 text-muted hover:bg-muted/10 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {error ? (
            <p className="mt-2 text-xs text-danger">{error}</p>
          ) : preview ? (
            <>
              <div className="mt-1.5 flex items-start gap-2">
                <p className="line-clamp-2 flex-1 text-sm font-medium text-foreground">{preview.name}</p>
                {loading ? (
                  <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted" aria-hidden />
                ) : null}
              </div>
              {isDuplicate ? (
                <p className="mt-2 text-xs text-amber-700">{t.map.poiAddDuplicate}</p>
              ) : (
                <div className="mt-2">
                  <label className="text-[10px] font-medium text-muted">{t.map.poiAddDayLabel}</label>
                  <select
                    value={dayNumber}
                    onChange={(event) => setDayNumber(Number(event.target.value))}
                    className="mt-1 w-full rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-foreground"
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
          ) : loading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              {t.map.poiAddLoading}
            </div>
          ) : null}

          {preview && !isDuplicate && !error ? (
            <button
              type="button"
              disabled={submitting || loading}
              onClick={() => void handleConfirm()}
              className="mt-2.5 w-full rounded-lg bg-primary px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {submitting ? t.map.poiAddSubmitting : t.map.poiAddConfirm}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function MapPoiAddOverlay({
  map,
  mapReady,
  tripDestination,
  onMapClickSuppress,
}: MapPoiAddOverlayProps) {
  const pendingPoi = useMapStore((state) => state.pendingPoi);
  const preferredPoiDay = useMapStore((state) => state.preferredPoiDay);
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const overlayRef = useRef<{
    poiKey: string;
    overlay: { setMap: (map: GoogleMapInstance | null) => void; draw: () => void };
    container: HTMLDivElement;
    listeners: Array<{ remove?: () => void }>;
  } | null>(null);
  const pendingPoiRef = useRef(pendingPoi);
  pendingPoiRef.current = pendingPoi;

  const poiKey = pendingPoiKey(pendingPoi);

  const previewState = usePendingPoiPreview({
    tripDestination,
    defaultDayNumber: preferredPoiDay,
    onDismiss: useCallback(() => setMenuOpen(false), []),
  });

  useEffect(() => {
    if (!poiKey) {
      setMenuOpen(false);
    }
  }, [poiKey]);

  useEffect(() => {
    const maps = window.google?.maps;
    if (!mapReady || !map || !maps || !poiKey || !previewState.showAddUi) {
      if (overlayRef.current) {
        overlayRef.current.listeners.forEach((listener) => listener.remove?.());
        overlayRef.current.overlay.setMap(null);
        overlayRef.current = null;
      }
      setPortalTarget(null);
      return;
    }

    if (overlayRef.current?.poiKey === poiKey) {
      overlayRef.current.overlay.draw();
      return;
    }

    if (overlayRef.current) {
      overlayRef.current.listeners.forEach((listener) => listener.remove?.());
      overlayRef.current.overlay.setMap(null);
      overlayRef.current = null;
    }

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.zIndex = "1000";

    class PoiAddOverlay extends maps.OverlayView {
      onAdd() {
        this.getPanes()?.floatPane.appendChild(container);
      }
      draw() {
        const poi = pendingPoiRef.current;
        if (!poi) {
          return;
        }
        const projection = this.getProjection();
        const point = projection?.fromLatLngToDivPixel(new maps.LatLng(poi.lat, poi.lng));
        if (point) {
          container.style.left = `${point.x}px`;
          container.style.top = `${point.y}px`;
          container.style.transform = "translate(-50%, calc(-100% - 6px))";
        }
      }
      onRemove() {
        container.remove();
      }
    }

    const overlay = new PoiAddOverlay();
    overlay.setMap(map);

    const redraw = () => overlay.draw();
    const listeners = ["bounds_changed", "zoom_changed", "center_changed"].map((event) =>
      map.addListener?.(event, redraw),
    );

    overlayRef.current = { poiKey, overlay, container, listeners };
    setPortalTarget(container);

    return () => {
      listeners.forEach((listener) => listener?.remove?.());
      overlay.setMap(null);
      if (overlayRef.current?.poiKey === poiKey) {
        overlayRef.current = null;
      }
      setPortalTarget(null);
    };
  }, [map, mapReady, poiKey, previewState.showAddUi]);

  if (!portalTarget || !pendingPoi || !poiKey || !previewState.showAddUi) {
    return null;
  }

  return createPortal(
    <MapPoiAddOverlayContent
      menuOpen={menuOpen}
      setMenuOpen={setMenuOpen}
      preview={previewState.preview}
      loading={previewState.loading}
      error={previewState.error}
      dayNumber={previewState.dayNumber}
      setDayNumber={previewState.setDayNumber}
      dayOptions={previewState.dayOptions}
      defaultDayNumber={preferredPoiDay}
      isDuplicate={previewState.isDuplicate}
      dismiss={previewState.dismiss}
      onMapClickSuppress={onMapClickSuppress}
    />,
    portalTarget,
  );
}
