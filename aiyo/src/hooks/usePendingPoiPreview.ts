"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { itineraryHasPlaceId } from "@/lib/addPlaceToItinerary";
import {
  fetchPendingPoiLocation,
  isResolvableMapPickLocation,
} from "@/lib/pendingPoiLocation";
import { zhTW as t } from "@/locales/zh-TW";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { LocationReference } from "@/types";

type UsePendingPoiPreviewOptions = {
  tripDestination: string;
  defaultDayNumber: number;
  onDismiss?: () => void;
};

export function pendingPoiKey(
  poi: { lat: number; lng: number; placeId?: string } | null,
): string | null {
  if (!poi) {
    return null;
  }
  return `${poi.lat.toFixed(6)}|${poi.lng.toFixed(6)}|${poi.placeId ?? ""}`;
}

export function usePendingPoiPreview({
  tripDestination,
  defaultDayNumber,
  onDismiss,
}: UsePendingPoiPreviewOptions) {
  const { status } = useSession();
  const pendingPoi = useMapStore((state) => state.pendingPoi);
  const setPendingPoi = useMapStore((state) => state.setPendingPoi);
  const itinerary = useTripStore((state) => state.itinerary);
  const pushToast = useToastStore((state) => state.pushToast);
  const onDismissRef = useRef(onDismiss);
  const pushToastRef = useRef(pushToast);
  const tripDestinationRef = useRef(tripDestination);
  onDismissRef.current = onDismiss;
  pushToastRef.current = pushToast;
  tripDestinationRef.current = tripDestination;

  const poiKey = pendingPoiKey(pendingPoi);
  const pendingPoiRef = useRef(pendingPoi);
  pendingPoiRef.current = pendingPoi;

  const [dayNumber, setDayNumber] = useState(defaultDayNumber);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<LocationReference | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dayOptions = itinerary.map((day) => day.dayNumber);
  const isDuplicate =
    Boolean(preview?.placeId) && itineraryHasPlaceId(itinerary, preview!.placeId!);

  const previewResolvable =
    Boolean(preview) &&
    Boolean(pendingPoi) &&
    isResolvableMapPickLocation(preview!, pendingPoi!.lat, pendingPoi!.lng);

  const showAddUi =
    Boolean(pendingPoi) &&
    ((loading && Boolean(pendingPoi.placeId)) ||
      previewResolvable ||
      (Boolean(error) && Boolean(pendingPoi.placeId)));

  const dismiss = useCallback(() => {
    setPendingPoi(null);
    setPreview(null);
    setError(null);
    setLoading(false);
    onDismissRef.current?.();
  }, [setPendingPoi]);

  const rejectUnresolvedPick = useCallback(() => {
    pushToastRef.current({
      variant: "error",
      title: t.map.poiAddTitle,
      description: t.map.poiAddNotResolvable,
    });
    setPendingPoi(null);
    setPreview(null);
    setError(null);
    setLoading(false);
    onDismissRef.current?.();
  }, [setPendingPoi]);

  useEffect(() => {
    setDayNumber(defaultDayNumber);
  }, [defaultDayNumber, poiKey]);

  useEffect(() => {
    if (!poiKey) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }
    const activePoi = pendingPoiRef.current;
    if (!activePoi) {
      return;
    }
    if (status === "unauthenticated") {
      pushToastRef.current({
        variant: "error",
        title: t.map.poiAddTitle,
        description: t.map.poiAddLoginRequired,
      });
      setPendingPoi(null);
      setPreview(null);
      setError(null);
      setLoading(false);
      onDismissRef.current?.();
      return;
    }
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);

    void fetchPendingPoiLocation(activePoi, tripDestinationRef.current)
      .then((location) => {
        if (cancelled) {
          return;
        }
        if (!isResolvableMapPickLocation(location, activePoi.lat, activePoi.lng)) {
          rejectUnresolvedPick();
          return;
        }
        setPreview(location);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        const isInvalidCoords =
          fetchError instanceof Error && fetchError.message === "invalid_coordinates";
        if (isInvalidCoords || !activePoi.placeId) {
          rejectUnresolvedPick();
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
  }, [poiKey, rejectUnresolvedPick, setPendingPoi, status]);

  return useMemo(
    () => ({
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
    }),
    [
      dayNumber,
      dayOptions,
      dismiss,
      error,
      isDuplicate,
      loading,
      pendingPoi,
      preview,
      showAddUi,
    ],
  );
}
