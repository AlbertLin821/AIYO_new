"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, m } from "@/lib/motion";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, Loader2, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import { zhTW as t } from "@/locales/zh-TW";
import { buildItineraryRouteSegments } from "@/lib/routeSegments";
import { transportDisplayLabel, type TransportDisplayOption } from "@/lib/transportDisplay";
import { getRegionalTransitOptions } from "@/lib/tripTransportRegion";
import { cn } from "@/lib/utils";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { ensureItineraryDayCount } from "@/lib/ensureItineraryDays";
import { nextActivityTime } from "@/lib/addPlaceToItinerary";
import { createTripItemId } from "@/lib/tripItemIds";
import { findLinkedPinForItem } from "@/lib/mapPinItineraryLink";
import PlaceConfirmDialog from "@/components/itinerary/PlaceConfirmDialog";
import {
  findItineraryItemDayNumber,
  itineraryDayContainerId,
  parseItineraryDayContainerId,
  resolveItineraryDragTarget,
} from "@/components/itinerary/itineraryDragUtils";
import ConfirmDialog from "@/components/system/ConfirmDialog";
import MapPoiAddCard from "@/components/map/MapPoiAddCard";
import { listTripsForLibrary, setActiveTrip } from "@/services/itineraryClient";
import {
  buildItineraryFieldsFromResolvedLocation,
  finalizeManualPlaceLocation,
  resolveManualPlaceLocation,
} from "@/services/resolveManualPlaceLocation";
import { manualPlaceFailureToast } from "@/lib/places/manualPlaceFailureToast";
import { syncService } from "@/services/syncService";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import type { LocationReference, MapPin as TripMapPin, TripPlanDay, TripPlanItem } from "@/types";
import type { PlaceSuggestion } from "@/types/geocode";

const typeColors: Record<TripPlanItem["type"], string> = {
  attraction: "bg-primary/10 text-primary",
  restaurant: "bg-secondary/10 text-secondary",
  shopping: "bg-peach/30 text-foreground",
  activity: "bg-lavender/15 text-lavender",
  transport: "bg-tertiary/15 text-foreground",
  hotel: "bg-muted/10 text-muted",
};

function transportSelectRows(destination: string) {
  return getRegionalTransitOptions(destination).map((row) => ({
    value: row.value,
    label: (t.itineraryPanel as Record<string, string>)[row.labelKey] ?? row.value,
  }));
}

function buildPinFromItineraryItem(item: TripPlanItem, dayNumber: number): TripMapPin | null {
  const location = item.location;
  if (!location || !hasUsableMapCoordinate(location)) {
    return null;
  }
  return {
    id: `day_${dayNumber}_${item.id}`,
    name: location.name,
    lat: location.lat,
    lng: location.lng,
    description: item.notes || location.description,
    address: location.address,
    placeId: location.placeId,
    photoUrl: location.photoUrl,
    thumbnail: location.thumbnail || location.photoUrl,
    openingHours: location.openingHours,
    phoneNumber: location.phoneNumber,
    website: location.website,
    googleMapsUrl: location.googleMapsUrl,
    rating: location.rating,
    userRatingsTotal: location.userRatingsTotal,
    source: "itinerary",
    linkedTripItemId: item.id,
    dayNumber,
    color: "#5a7ea3",
    confidence: location.confidence,
    verified: location.verified,
  };
}

type TransportSelectOption = TransportDisplayOption;

function MapDayDropZone({
  dayNumber,
  children,
}: {
  dayNumber: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: itineraryDayContainerId(dayNumber) });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "transition-colors",
        isOver && "bg-primary/[0.06] ring-1 ring-inset ring-primary/30",
      )}
    >
      {children}
    </div>
  );
}

function MapStopDragPreview({ item }: { item: TripPlanItem }) {
  return (
    <div className="w-[min(340px,calc(100vw-2rem))] cursor-grabbing rounded-xl border border-primary/35 bg-surface px-3 py-2.5 shadow-xl ring-2 ring-primary/25">
      <div className="mb-0.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-primary">{item.time?.slice(0, 5) || "09:00"}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", typeColors[item.type])}>
          {typeLabel(item.type)}
        </span>
      </div>
      <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
      {item.location?.name ? (
        <p className="mt-0.5 truncate text-[11px] text-muted">{item.location.name}</p>
      ) : null}
    </div>
  );
}

function findItineraryItemById(itineraryDays: TripPlanDay[], itemId: string): TripPlanItem | null {
  for (const day of itineraryDays) {
    const item = day.items.find((entry) => entry.id === itemId);
    if (item) {
      return item;
    }
  }
  return null;
}

type SortableStopProps = {
  item: TripPlanItem;
  isSelected: boolean;
  canSelectOnMap: boolean;
  incomingRoute: ReturnType<typeof buildItineraryRouteSegments>[number] | undefined;
  currentTransport: string;
  transportOptions: TransportSelectOption[];
  isEditingTitle: boolean;
  editingTitle: string;
  onSelectPin: () => void;
  onTransportChange: (value: string) => void;
  onStartTitleEdit: () => void;
  onTitleChange: (value: string) => void;
  onCommitTitle: () => void;
  onCancelTitle: () => void;
  onTimeChange: (value: string) => void;
  onDelete: () => void;
};

function SortableMapStop({
  item,
  isSelected,
  canSelectOnMap,
  incomingRoute,
  currentTransport,
  transportOptions,
  isEditingTitle,
  editingTitle,
  onSelectPin,
  onTransportChange,
  onStartTitleEdit,
  onTitleChange,
  onCommitTitle,
  onCancelTitle,
  onTimeChange,
  onDelete,
}: SortableStopProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative" as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "touch-none cursor-grab active:cursor-grabbing",
        isDragging && "opacity-0",
      )}
      {...attributes}
      {...listeners}
      aria-label={t.itineraryPanel.dragReorderAria}
    >
      {incomingRoute && (
        <div
          className="rounded-xl border border-border-light bg-surface-elevated/60 px-3 py-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center">
            <label className="sr-only" htmlFor={`transport_${incomingRoute.id}`}>
              {t.itineraryPanel.segmentTransport}
            </label>
            <select
              id={`transport_${incomingRoute.id}`}
              value={currentTransport}
              onChange={(event) => onTransportChange(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            >
              {!transportOptions.some((option) => option.value === currentTransport) && (
                <option value={currentTransport}>{transportDisplayLabel(currentTransport, transportOptions)}</option>
              )}
              {transportOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="flex items-start gap-2">
        <div
          role="button"
          tabIndex={canSelectOnMap ? 0 : -1}
          aria-disabled={!canSelectOnMap && !isEditingTitle}
          onClick={() => canSelectOnMap && onSelectPin()}
          onKeyDown={(event) => {
            if (!canSelectOnMap || (event.key !== "Enter" && event.key !== " ")) {
              return;
            }
            event.preventDefault();
            onSelectPin();
          }}
          className={cn(
            "group flex min-w-0 flex-1 items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
            !canSelectOnMap && "cursor-default opacity-95",
            canSelectOnMap && isSelected ? "bg-primary/10 ring-1 ring-primary/20" : canSelectOnMap && "hover:bg-cream/60",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`time_${item.id}`}>
                {t.itineraryPanel.timeLabel}
              </label>
              <input
                id={`time_${item.id}`}
                type="time"
                value={item.time?.slice(0, 5) || "09:00"}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onTimeChange(event.target.value)}
                className="w-[6.75rem] rounded-md border border-border-light bg-surface px-1.5 py-0.5 font-mono text-xs text-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  typeColors[item.type],
                )}
              >
                {typeLabel(item.type)}
              </span>
            </div>
            {isEditingTitle ? (
              <input
                value={editingTitle}
                autoFocus
                data-testid="itinerary-panel-title-input"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onTitleChange(event.target.value)}
                onBlur={onCommitTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onCommitTitle();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onCancelTitle();
                  }
                }}
                className="mt-1 w-full rounded-lg border border-primary/30 bg-surface px-2 py-1 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            ) : (
              <p
                className="truncate text-sm font-medium text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  if (canSelectOnMap) {
                    onSelectPin();
                  }
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (item.source === "manual") {
                    onStartTitleEdit();
                  }
                }}
              >
                {item.title}
              </p>
            )}
            {item.location && (
              <button
                type="button"
                disabled={!canSelectOnMap}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (canSelectOnMap) {
                    onSelectPin();
                  }
                }}
                className={cn(
                  "mt-0.5 flex max-w-full items-center gap-1 text-left text-[11px] text-muted transition-colors",
                  canSelectOnMap && "hover:text-primary hover:underline",
                  !canSelectOnMap && "cursor-default",
                )}
              >
                <MapPin className="size-3" />
                <span className="truncate">{item.location.name}</span>
              </button>
            )}
            {!canSelectOnMap && (
              <p className="mt-1 text-[10px] text-muted">{t.itineraryPanel.noMapPinYet}</p>
            )}
          </div>
          <button
            type="button"
            aria-label={`刪除活動：${item.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="shrink-0 rounded-lg p-1 text-muted opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function typeLabel(itemType: TripPlanItem["type"]) {
  const labels: Record<TripPlanItem["type"], string> = {
    attraction: t.itineraryPanel.typeAttraction,
    restaurant: t.itineraryPanel.typeRestaurant,
    shopping: t.itineraryPanel.typeShopping,
    activity: t.itineraryPanel.typeActivity,
    transport: t.itineraryPanel.typeTransport,
    hotel: t.itineraryPanel.typeHotel,
  };
  return labels[itemType];
}

type ItineraryPanelProps = {
  embedded?: boolean;
  enablePoiAdd?: boolean;
};

export default function ItineraryPanel({ embedded = false, enablePoiAdd = true }: ItineraryPanelProps) {
  const { status } = useSession();
  const itinerary = useTripStore((state) => state.itinerary);
  const tripTitle = useTripStore((state) => state.title);
  const tripDestination = useTripStore((state) => state.destination);
  const currentTripId = useTripStore((state) => state.tripId);
  const updateItineraryItem = useTripStore((state) => state.updateItineraryItem);
  const addItineraryItem = useTripStore((state) => state.addItineraryItem);
  const updateItineraryItemTransport = useTripStore((state) => state.updateItineraryItemTransport);
  const removeItineraryItem = useTripStore((state) => state.removeItineraryItem);
  const reorderItineraryItem = useTripStore((state) => state.reorderItineraryItem);
  const moveItineraryItemBetweenDays = useTripStore((state) => state.moveItineraryItemBetweenDays);
  const {
    panelOpen,
    setPanelOpen,
    pins,
    selectedPinId,
    setSelectedPinId,
    removePin,
    setPreferredPoiDay,
    pendingPoi,
    preferredPoiDay,
    setVisibleRouteDayNumbers,
    clearVisibleRouteDayNumbers,
  } = useMapStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});

  const prevPendingPoiRef = useRef(pendingPoi);
  const lastExpandedTripIdRef = useRef<string | null>(null);

  useEffect(() => {
    const tripChanged = lastExpandedTripIdRef.current !== currentTripId;
    lastExpandedTripIdRef.current = currentTripId;
    setExpandedDays((prev) => {
      const next: Record<number, boolean> = {};
      for (const day of itinerary) {
        next[day.dayNumber] = tripChanged ? true : (prev[day.dayNumber] ?? true);
      }
      return next;
    });
  }, [currentTripId, itinerary]);

  useEffect(() => {
    const expandedDayNumbers = itinerary
      .filter((day) => expandedDays[day.dayNumber])
      .map((day) => day.dayNumber);
    if (expandedDayNumbers.length === 0) {
      clearVisibleRouteDayNumbers();
      return;
    }
    setVisibleRouteDayNumbers(expandedDayNumbers);
  }, [clearVisibleRouteDayNumbers, expandedDays, itinerary, setVisibleRouteDayNumbers]);

  useEffect(() => {
    if (enablePoiAdd) {
      const preferredDay =
        itinerary.find((day) => expandedDays[day.dayNumber])?.dayNumber ?? itinerary[0]?.dayNumber ?? 1;
      setPreferredPoiDay(preferredDay);
    }
  }, [enablePoiAdd, expandedDays, itinerary, setPreferredPoiDay]);

  useEffect(() => {
    if (prevPendingPoiRef.current && !pendingPoi) {
      setExpandedDays((prev) => ({ ...prev, [preferredPoiDay]: true }));
    }
    prevPendingPoiRef.current = pendingPoi;
  }, [pendingPoi, preferredPoiDay]);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{
    dayNumber: number;
    itemId: string;
    title: string;
    linkedPinId: string | null;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<{ dayNumber: number; itemId: string; title: string } | null>(null);
  const routeSegments = useMemo(() => buildItineraryRouteSegments(itinerary), [itinerary]);
  const transportOptions = useMemo(() => transportSelectRows(tripDestination), [tripDestination]);

  const [tripList, setTripList] = useState<ItineraryListItem[]>([]);
  const [tripListLoading, setTripListLoading] = useState(false);
  const [tripSwitching, setTripSwitching] = useState(false);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [placeSearch, setPlaceSearch] = useState<{
    dayNumber: number;
    query: string;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const [placePick, setPlacePick] = useState<{
    dayNumber: number;
    itemId: string;
    preferredName: string;
    query: string;
    suggestions: PlaceSuggestion[];
  } | null>(null);
  const [placePickPending, setPlacePickPending] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<TripPlanItem | null>(null);

  const isPanelVisible = embedded || panelOpen;

  useEffect(() => {
    if (status !== "authenticated" || !isPanelVisible) return;
    let cancelled = false;
    setTripListLoading(true);
    listTripsForLibrary("recent")
      .then((rows) => { if (!cancelled) setTripList(rows); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTripListLoading(false); });
    return () => { cancelled = true; };
  }, [status, isPanelVisible]);

  const handleSwitchTrip = useCallback(
    async (tripId: string) => {
      if (tripId === currentTripId || tripSwitching) return;
      setTripSwitching(true);
      try {
        const snapshot = await setActiveTrip(tripId);
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
        setExpandedDays({ 1: true });
      } catch (error) {
        pushToast({
          variant: "error",
          title: t.itineraryPanel.title,
          description: error instanceof Error ? error.message : "無法切換行程",
        });
      } finally {
        setTripSwitching(false);
      }
    },
    [currentTripId, pushToast, tripSwitching],
  );

  const addQuickStop = useCallback((dayNumber: number) => {
    setPlaceSearch({ dayNumber, query: "", loading: false, error: null });
  }, []);

  const submitPlaceSearch = useCallback(async () => {
    if (!placeSearch || placeSearch.loading) {
      return;
    }
    const query = placeSearch.query.trim();
    if (!query) {
      setPlaceSearch((current) =>
        current ? { ...current, error: "請輸入地點名稱。" } : current,
      );
      return;
    }

    const dayNumber = placeSearch.dayNumber;
    setPlaceSearch((current) => (current ? { ...current, loading: true, error: null } : current));
    try {
      const resolved = await resolveManualPlaceLocation(query, tripDestination);

      if (resolved.status === "failed") {
        const failureToast = manualPlaceFailureToast(resolved.reason, false);
        pushToast({
          variant: "warning",
          title: failureToast.title,
          description: resolved.message || failureToast.description,
        });
        setPlaceSearch((current) => (current ? { ...current, loading: false } : current));
        return;
      }

      ensureItineraryDayCount(dayNumber);
      const day = useTripStore.getState().itinerary.find((entry) => entry.dayNumber === dayNumber);
      const itemId = createTripItemId("manual");
      const activityTime = nextActivityTime(day?.items ?? []);

      if (resolved.status === "auto") {
        const fields = buildItineraryFieldsFromResolvedLocation(resolved.location, query);
        addItineraryItem(dayNumber, {
          id: itemId,
          dayNumber,
          time: activityTime,
          title: fields.title,
          type: "activity",
          notes: undefined,
          location: fields.location,
          source: "manual",
        });
        setExpandedDays((prev) => ({ ...prev, [dayNumber]: true }));
        setPlaceSearch(null);
        setSelectedPinId(`day_${dayNumber}_${itemId}`);
        pushToast({
          variant: "success",
          title: t.itineraryPage.addActivityGeocodedTitle,
          description: t.itineraryPage.addActivityGeocodedDesc,
        });
      } else {
        addItineraryItem(dayNumber, {
          id: itemId,
          dayNumber,
          time: activityTime,
          title: query,
          type: "activity",
          notes: undefined,
          location: {
            name: query,
            lat: 0,
            lng: 0,
            description: query,
            address: query,
          },
          source: "manual",
        });
        setExpandedDays((prev) => ({ ...prev, [dayNumber]: true }));
        setPlaceSearch(null);
        setPlacePick({
          dayNumber,
          itemId,
          preferredName: query,
          query: resolved.query,
          suggestions: resolved.suggestions,
        });
      }

      await syncService.flushTripSyncNow({ force: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "新增活動失敗。";
      setPlaceSearch((current) => (current ? { ...current, loading: false, error: message } : current));
      pushToast({
        variant: "error",
        title: t.itineraryPanel.addLocalActivity,
        description: message,
      });
    }
  }, [addItineraryItem, ensureItineraryDayCount, placeSearch, pushToast, setSelectedPinId, tripDestination]);

  const handlePlacePickSelect = useCallback(
    async (suggestion: PlaceSuggestion) => {
      if (!placePick) {
        return;
      }
      setPlacePickPending(true);
      try {
        const region = useTripStore.getState().destination;
        const location = await finalizeManualPlaceLocation(
          suggestion,
          suggestion.placeName,
          region,
        );
        const fields = buildItineraryFieldsFromResolvedLocation(location, placePick.preferredName);
        updateItineraryItem(placePick.dayNumber, placePick.itemId, {
          title: fields.title,
          location: fields.location,
        });
        setSelectedPinId(`day_${placePick.dayNumber}_${placePick.itemId}`);
        pushToast({
          variant: "success",
          title: t.itineraryPage.placeConfirmAppliedTitle,
          description: t.itineraryPage.placeConfirmAppliedDesc,
        });
        setPlacePick(null);
        await syncService.flushTripSyncNow({ force: true });
      } finally {
        setPlacePickPending(false);
      }
    },
    [placePick, pushToast, setSelectedPinId, updateItineraryItem],
  );

  const handlePlacePickSkip = useCallback(() => {
    if (placePickPending) {
      return;
    }
    setPlacePick(null);
    pushToast({
      variant: "info",
      title: t.itineraryPage.placeConfirmSkippedTitle,
      description: t.itineraryPage.placeConfirmSkippedDesc,
    });
  }, [placePickPending, pushToast]);

  const commitTitleEdit = useCallback(() => {
    if (!editingItem) {
      return;
    }
    const nextTitle = editingItem.title.trim() || t.itineraryPanel.newActivityTitle;
    updateItineraryItem(editingItem.dayNumber, editingItem.itemId, { title: nextTitle });
    setEditingItem(null);
  }, [editingItem, updateItineraryItem]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const item = findItineraryItemById(itinerary, String(event.active.id));
      setActiveDragItem(item);
    },
    [itinerary],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!event.over) {
        return;
      }
      const target = resolveItineraryDragTarget(itinerary, String(event.over.id));
      if (!target) {
        return;
      }
      setExpandedDays((prev) => ({ ...prev, [target.dayNumber]: true }));
    },
    [itinerary],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragItem(null);
      const { active, over } = event;
      if (!over) {
        return;
      }

      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) {
        return;
      }

      const fromDayNumber = findItineraryItemDayNumber(itinerary, activeId);
      const target = resolveItineraryDragTarget(itinerary, overId);
      if (fromDayNumber == null || !target) {
        return;
      }

      const fromDay = itinerary.find((entry) => entry.dayNumber === fromDayNumber);
      if (!fromDay) {
        return;
      }

      const oldIndex = fromDay.items.findIndex((item) => item.id === activeId);
      if (oldIndex === -1) {
        return;
      }

      if (fromDayNumber === target.dayNumber) {
        let newIndex = target.index;
        if (parseItineraryDayContainerId(overId) != null) {
          newIndex = Math.max(0, fromDay.items.length - 1);
        }
        if (oldIndex !== newIndex) {
          reorderItineraryItem(fromDayNumber, oldIndex, newIndex);
          pushToast({
            variant: "success",
            title: "已更新排序",
            description: "已依新順序調整行程時間。",
          });
        }
        return;
      }

      moveItineraryItemBetweenDays(fromDayNumber, target.dayNumber, activeId, target.index);
      setExpandedDays((prev) => ({ ...prev, [target.dayNumber]: true }));
      pushToast({
        variant: "success",
        title: "已移動活動",
        description: `已將活動移至第 ${target.dayNumber} 天。`,
      });
    },
    [itinerary, moveItineraryItemBetweenDays, pushToast, reorderItineraryItem],
  );

  const handleDayHeaderClick = useCallback((dayNumber: number) => {
    setExpandedDays((prev) => ({ ...prev, [dayNumber]: !prev[dayNumber] }));
  }, []);

  return (
    <>
    <AnimatePresence>
      {isPanelVisible && (
        <m.div
          initial={embedded ? undefined : { x: "100%", opacity: 0 }}
          animate={embedded ? undefined : { x: 0, opacity: 1 }}
          exit={embedded ? undefined : { x: "100%", opacity: 0 }}
          transition={embedded ? undefined : { type: "spring", damping: 28, stiffness: 280 }}
          className={cn(
            "flex h-full w-full flex-col bg-surface",
            embedded
              ? "relative border-0 shadow-none"
              : "absolute right-0 top-0 z-20 max-w-[380px] border-l-4 border-primary/40 shadow-soft-lg sm:w-[380px]",
          )}
        >
          <div className="flex items-center justify-between border-b-2 border-border bg-surface-elevated/80 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t.itineraryPanel.title}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {t.itineraryPanel.loadedSummary} {itinerary.length} {t.itineraryPanel.dayUnit}
              </p>
            </div>
            {!embedded ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  aria-label={t.itineraryPanel.closePanelAria}
                  className="cursor-pointer rounded-lg p-1.5 text-muted transition-colors hover:bg-border-light hover:text-foreground"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>

          {enablePoiAdd ? (
            <MapPoiAddCard
              defaultDayNumber={preferredPoiDay}
              tripDestination={tripDestination}
            />
          ) : null}

          <div className="border-b border-border-light bg-cream/30 px-5 py-3">
            <button
              type="button"
              disabled={tripSwitching}
              onClick={() => setTripPickerOpen(true)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border border-border-light bg-surface px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-cream/40",
                tripSwitching && "opacity-60",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted">切換行程</p>
                <p className="truncate text-sm font-medium text-foreground">
                  {currentTripId ? tripTitle || tripDestination || "目前行程" : "目前尚未創建行程"}
                </p>
              </div>
              {tripSwitching ? (
                <Loader2 className="ml-2 size-4 shrink-0 animate-spin text-primary" aria-hidden />
              ) : (
                <ChevronDown className="ml-2 size-4 shrink-0 text-muted" aria-hidden />
              )}
            </button>
          </div>

          <AnimatePresence>
            {tripPickerOpen && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-30 flex flex-col bg-black/40"
                onClick={() => { if (!tripSwitching) setTripPickerOpen(false); }}
              >
                <m.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                  className="m-4 flex max-h-[70%] flex-col rounded-2xl border border-border-light bg-surface shadow-soft-lg"
                >
                  <div className="flex items-center justify-between border-b border-border-light px-5 py-4">
                    <h4 className="text-sm font-semibold text-foreground">選擇行程</h4>
                    <button
                      type="button"
                      onClick={() => setTripPickerOpen(false)}
                      className="rounded-lg p-1 text-muted transition-colors hover:bg-border-light hover:text-foreground"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2">
                    {tripListLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
                      </div>
                    ) : tripList.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-muted">
                        目前尚未創建行程
                      </div>
                    ) : (
                      tripList.map((trip) => {
                        const isActive = trip.id === currentTripId;
                        return (
                          <button
                            key={trip.id}
                            type="button"
                            disabled={tripSwitching}
                            onClick={() => {
                              if (isActive) {
                                setTripPickerOpen(false);
                                return;
                              }
                              void handleSwitchTrip(trip.id).then(() => setTripPickerOpen(false));
                            }}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors",
                              isActive
                                ? "bg-primary/10 ring-1 ring-primary/25"
                                : "hover:bg-cream/60",
                              tripSwitching && "opacity-60",
                            )}
                          >
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                              {trip.days} 天
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {trip.title || "目前尚未創建行程"}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-muted">
                                {trip.destination || "未設定目的地"}
                                {isActive ? " (目前)" : ""}
                              </p>
                            </div>
                            {isActive && (
                              <div className="size-2 shrink-0 rounded-full bg-primary" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </m.div>
              </m.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {placeSearch && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4"
                onClick={() => {
                  if (!placeSearch.loading) {
                    setPlaceSearch(null);
                  }
                }}
              >
                <m.form
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 10 }}
                  transition={{ duration: 0.18 }}
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitPlaceSearch();
                  }}
                  className="w-full rounded-2xl border border-border-light bg-surface p-4 shadow-soft-lg"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">新增活動地點</h4>
                      <p className="mt-0.5 text-xs text-muted">
                        輸入景點、餐廳或地址，系統會加入行程並同步地圖標記。
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={placeSearch.loading}
                      onClick={() => setPlaceSearch(null)}
                      className="rounded-lg p-1 text-muted transition hover:bg-border-light hover:text-foreground disabled:opacity-50"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                  <label className="sr-only" htmlFor="itinerary-place-search">
                    搜尋地點
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2 focus-within:ring-2 focus-within:ring-primary/25">
                    <Search className="size-4 shrink-0 text-muted" aria-hidden />
                    <input
                      id="itinerary-place-search"
                      autoFocus
                      value={placeSearch.query}
                      onChange={(event) =>
                        setPlaceSearch((current) =>
                          current ? { ...current, query: event.target.value, error: null } : current,
                        )
                      }
                      placeholder="例如：台北 101、阿宗麵線、西門町"
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                    />
                  </div>
                  {placeSearch.error && (
                    <p className="mt-2 text-xs text-red-600">{placeSearch.error}</p>
                  )}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={placeSearch.loading}
                      onClick={() => setPlaceSearch(null)}
                      className="rounded-xl border border-border px-3 py-2 text-xs text-muted transition hover:bg-border-light disabled:opacity-50"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={placeSearch.loading}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {placeSearch.loading && <Loader2 className="size-3 animate-spin" aria-hidden />}
                      加入行程
                    </button>
                  </div>
                </m.form>
              </m.div>
            )}
          </AnimatePresence>

          <div className={cn("flex-1 overflow-y-auto", embedded && "min-h-0")}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {itinerary.map((day) => (
                <MapDayDropZone key={day.dayNumber} dayNumber={day.dayNumber}>
                  <div className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => handleDayHeaderClick(day.dayNumber)}
                      className="flex w-full cursor-pointer items-center justify-between px-5 py-3 transition-colors hover:bg-cream/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                          {t.itineraryPanel.dayShort}
                          {day.dayNumber}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-foreground">
                            {t.itineraryPanel.dayPrefix}
                            {day.dayNumber}
                            {t.itineraryPanel.daySuffix}
                          </p>
                          {day.theme && <p className="text-[11px] text-muted">{day.theme}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-border-light px-1.5 py-0.5 text-[10px] text-muted">
                          {day.items.length} 個地點
                        </span>
                        {expandedDays[day.dayNumber] ? (
                          <ChevronUp className="size-4 text-muted" />
                        ) : (
                          <ChevronDown className="size-4 text-muted" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence>
                      {expandedDays[day.dayNumber] && (
                        <m.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className={cn("overflow-hidden", activeDragItem && "overflow-visible")}
                        >
                          <div className="flex flex-col gap-1 px-5 pb-3">
                            <SortableContext
                              items={day.items.map((i) => i.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {day.items.map((item) => {
                              const linkedPin = findLinkedPinForItem(item, pins);
                              const isSelected = linkedPin?.id === selectedPinId;
                              const canSelectOnMap = Boolean(linkedPin || hasUsableMapCoordinate(item.location));
                              const incomingRoute = routeSegments.find(
                                (segment) =>
                                  segment.dayNumber === day.dayNumber && segment.toItemId === item.id,
                              );
                              const trimmedItemTransport =
                                typeof item.transport === "string" ? item.transport.trim() : "";
                              const currentTransport =
                                trimmedItemTransport !== ""
                                  ? trimmedItemTransport
                                  : (incomingRoute?.transport ?? "Transit");
                              const isEditingTitle = editingItem?.itemId === item.id;
                              const editingTitleValue =
                                isEditingTitle && editingItem ? editingItem.title : "";

                              return (
                                <SortableMapStop
                                  key={item.id}
                                  item={item}
                                  isSelected={isSelected}
                                  canSelectOnMap={canSelectOnMap}
                                  incomingRoute={incomingRoute}
                                  currentTransport={currentTransport}
                                  transportOptions={transportOptions}
                                  isEditingTitle={isEditingTitle}
                                  editingTitle={editingTitleValue}
                                  onSelectPin={() => {
                                    if (linkedPin) {
                                      setSelectedPinId(linkedPin.id);
                                      return;
                                    }
                                    const pin = buildPinFromItineraryItem(item, day.dayNumber);
                                    if (!pin) {
                                      return;
                                    }
                                    const currentPins = useMapStore.getState().pins;
                                    useMapStore.getState().setPins([
                                      ...currentPins.filter((currentPin) => currentPin.id !== pin.id),
                                      pin,
                                    ]);
                                    setSelectedPinId(pin.id);
                                  }}
                                  onTransportChange={(value) =>
                                    {
                                      updateItineraryItemTransport(day.dayNumber, item.id, value);
                                      pushToast({
                                        variant: "success",
                                        title: "已更新交通方式",
                                        description: "已依新路線調整時間。",
                                      });
                                    }
                                  }
                                  onStartTitleEdit={() =>
                                    setEditingItem({
                                      dayNumber: day.dayNumber,
                                      itemId: item.id,
                                      title: item.title,
                                    })
                                  }
                                  onTitleChange={(value) =>
                                    setEditingItem((current) =>
                                      current ? { ...current, title: value } : current,
                                    )
                                  }
                                  onCommitTitle={commitTitleEdit}
                                  onCancelTitle={() => setEditingItem(null)}
                                  onTimeChange={(value) =>
                                    updateItineraryItem(day.dayNumber, item.id, { time: value })
                                  }
                                  onDelete={() => {
                                    setDeleteItemTarget({
                                      dayNumber: day.dayNumber,
                                      itemId: item.id,
                                      title: item.title.trim() || t.itineraryPanel.newActivityTitle,
                                      linkedPinId: linkedPin?.id ?? null,
                                    });
                                  }}
                                />
                              );
                            })}
                            </SortableContext>

                            <button
                              type="button"
                              onClick={() => addQuickStop(day.dayNumber)}
                              data-testid="itinerary-panel-add-activity"
                              className="mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs text-muted transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                            >
                              <Plus className="size-3" />
                              {t.itineraryPanel.addLocalActivity}
                            </button>
                          </div>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                </MapDayDropZone>
              ))}

              <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
                {activeDragItem ? <MapStopDragPreview item={activeDragItem} /> : null}
              </DragOverlay>
            </DndContext>
          </div>

        </m.div>
      )}
    </AnimatePresence>

      <PlaceConfirmDialog
        open={Boolean(placePick)}
        query={placePick?.query ?? ""}
        suggestions={placePick?.suggestions ?? []}
        pending={placePickPending}
        onSelect={(suggestion) => void handlePlacePickSelect(suggestion)}
        onSkip={handlePlacePickSkip}
      />

      <ConfirmDialog
        open={Boolean(deleteItemTarget)}
        title={t.itineraryPage.deleteItemDialogTitle}
        description={
          deleteItemTarget
            ? t.itineraryPage.deleteItemConfirm.replace("{name}", deleteItemTarget.title)
            : ""
        }
        confirmLabel={t.itineraryPage.deleteItemConfirmAction}
        cancelLabel={t.itineraryPage.deleteItemCancel}
        variant="danger"
        onCancel={() => setDeleteItemTarget(null)}
        onConfirm={() => {
          if (!deleteItemTarget) {
            return;
          }
          removeItineraryItem(deleteItemTarget.dayNumber, deleteItemTarget.itemId);
          if (deleteItemTarget.linkedPinId) {
            removePin(deleteItemTarget.linkedPinId);
          }
          setDeleteItemTarget(null);
        }}
      />
    </>
  );
}
