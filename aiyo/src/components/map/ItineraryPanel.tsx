"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarPlus, ChevronDown, ChevronUp, GripVertical, MapPin, Plus, X } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { buildItineraryRouteSegments } from "@/lib/routeSegments";
import { cn } from "@/lib/utils";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";
import type { MapPin as TripMapPin, TripPlanItem } from "@/types";

const typeColors: Record<TripPlanItem["type"], string> = {
  attraction: "bg-primary/10 text-primary",
  restaurant: "bg-secondary/10 text-secondary",
  shopping: "bg-peach/30 text-foreground",
  activity: "bg-lavender/15 text-lavender",
  transport: "bg-tertiary/15 text-foreground",
  hotel: "bg-muted/10 text-muted",
};

const transportOptions = [
  { value: "Walk", label: t.itineraryPanel.transportWalk },
  { value: "Metro", label: t.itineraryPanel.transportMetro },
  { value: "Train", label: t.itineraryPanel.transportTrain },
  { value: "Bus", label: t.itineraryPanel.transportBus },
  { value: "Taxi", label: t.itineraryPanel.transportTaxi },
  { value: "Car", label: t.itineraryPanel.transportCar },
  { value: "Mixed", label: t.itineraryPanel.transportMixed },
];

type SortableStopProps = {
  item: TripPlanItem;
  index: number;
  itemsLength: number;
  linkedPin: TripMapPin | undefined;
  isSelected: boolean;
  canSelectOnMap: boolean;
  incomingRoute: ReturnType<typeof buildItineraryRouteSegments>[number] | undefined;
  routeDisplayMinutes: number;
  currentTransport: string;
  hasKnownTransport: boolean;
  isEditingTitle: boolean;
  editingTitle: string;
  onSelectPin: () => void;
  onTransportChange: (value: string) => void;
  onStartTitleEdit: () => void;
  onTitleChange: (value: string) => void;
  onCommitTitle: () => void;
  onCancelTitle: () => void;
  onTimeChange: (value: string) => void;
};

function SortableMapStop({
  item,
  index,
  itemsLength,
  linkedPin,
  isSelected,
  canSelectOnMap,
  incomingRoute,
  routeDisplayMinutes,
  currentTransport,
  hasKnownTransport,
  isEditingTitle,
  editingTitle,
  onSelectPin,
  onTransportChange,
  onStartTitleEdit,
  onTitleChange,
  onCommitTitle,
  onCancelTitle,
  onTimeChange,
}: SortableStopProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-90 shadow-md")}>
      {incomingRoute && (
        <div className="ml-5 rounded-xl border border-border-light bg-surface-elevated/60 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] font-medium text-foreground">
              {incomingRoute.fromName} → {incomingRoute.toName}
            </p>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
              {routeDisplayMinutes} {t.itineraryPanel.minutesUnit}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="shrink-0 text-[10px] text-muted" htmlFor={`transport_${incomingRoute.id}`}>
              {t.itineraryPanel.segmentTransport}
            </label>
            <select
              id={`transport_${incomingRoute.id}`}
              value={currentTransport}
              onChange={(event) => onTransportChange(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            >
              {!hasKnownTransport && <option value={currentTransport}>{currentTransport}</option>}
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
        <button
          type="button"
          className="mt-2 shrink-0 cursor-grab touch-none rounded-md p-1 text-muted hover:bg-border-light hover:text-foreground active:cursor-grabbing"
          aria-label={t.itineraryPanel.dragReorderAria}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <div
          role="button"
          tabIndex={canSelectOnMap ? 0 : -1}
          aria-disabled={!canSelectOnMap && !isEditingTitle}
          onClick={() => linkedPin && onSelectPin()}
          onKeyDown={(event) => {
            if (!linkedPin || (event.key !== "Enter" && event.key !== " ")) {
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
          <div className="flex flex-col items-center gap-1 pt-1">
            <div className={cn("size-2 rounded-full", index === 0 ? "bg-primary" : "bg-border")} />
            {index < itemsLength - 1 && <div className="h-8 w-px bg-border-light" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`time_${item.id}`}>
                {t.itineraryPanel.timeLabel}
              </label>
              <input
                id={`time_${item.id}`}
                type="time"
                value={item.time?.slice(0, 5) || "09:00"}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onTimeChange(event.target.value)}
                className="w-[5.5rem] rounded-md border border-border-light bg-surface px-1 py-0.5 font-mono text-xs text-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
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
                  if (item.source !== "manual") {
                    return;
                  }
                  event.stopPropagation();
                  onStartTitleEdit();
                }}
              >
                {item.title}
              </p>
            )}
            {item.location && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                <MapPin className="size-3" />
                {item.location.name}
              </p>
            )}
            {!canSelectOnMap && (
              <p className="mt-1 text-[10px] text-muted">{t.itineraryPanel.noMapPinYet}</p>
            )}
          </div>
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

export default function ItineraryPanel() {
  const itinerary = useTripStore((state) => state.itinerary);
  const addItineraryItem = useTripStore((state) => state.addItineraryItem);
  const updateItineraryItem = useTripStore((state) => state.updateItineraryItem);
  const updateItineraryItemTransport = useTripStore((state) => state.updateItineraryItemTransport);
  const reorderItineraryItem = useTripStore((state) => state.reorderItineraryItem);
  const { panelOpen, setPanelOpen, pins, selectedPinId, setSelectedPinId } = useMapStore();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [expandedDay, setExpandedDay] = useState<number>(1);
  const [editingItem, setEditingItem] = useState<{ dayNumber: number; itemId: string; title: string } | null>(null);
  const manualItemCounter = useRef(0);
  const routeSegments = useMemo(() => buildItineraryRouteSegments(itinerary), [itinerary]);
  const segmentDirectionsMinutes = useMapStore((s) => s.segmentDirectionsMinutes);

  const addQuickStop = useCallback((dayNumber: number) => {
    manualItemCounter.current += 1;
    const id = `manual_${dayNumber}_${manualItemCounter.current}`;
    addItineraryItem(dayNumber, {
      id,
      dayNumber,
      time: "16:00",
      title: t.itineraryPanel.newActivityTitle,
      type: "activity",
      notes: t.itineraryPanel.newActivityNotes,
      source: "manual",
    });
    setEditingItem({ dayNumber, itemId: id, title: t.itineraryPanel.newActivityTitle });
  }, [addItineraryItem]);

  const commitTitleEdit = useCallback(() => {
    if (!editingItem) {
      return;
    }
    const nextTitle = editingItem.title.trim() || t.itineraryPanel.newActivityTitle;
    updateItineraryItem(editingItem.dayNumber, editingItem.itemId, { title: nextTitle });
    setEditingItem(null);
  }, [editingItem, updateItineraryItem]);

  const handleDayDragEnd = useCallback(
    (dayNumber: number, items: TripPlanItem[]) => (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }
      reorderItineraryItem(dayNumber, oldIndex, newIndex);
    },
    [reorderItineraryItem],
  );

  return (
    <AnimatePresence>
      {panelOpen && (
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
          className="absolute right-0 top-0 z-20 flex h-full w-full max-w-[380px] flex-col border-l-4 border-primary/40 bg-surface shadow-soft-lg sm:w-[380px]"
        >
          <div className="flex items-center justify-between border-b-2 border-border bg-surface-elevated/80 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t.itineraryPanel.title}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {t.itineraryPanel.loadedSummary} {itinerary.length} {t.itineraryPanel.dayUnit}
              </p>
            </div>
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
          </div>

          <div className="flex-1 overflow-y-auto">
            {itinerary.map((day) => (
              <div key={day.dayNumber} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedDay(expandedDay === day.dayNumber ? -1 : day.dayNumber)
                  }
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
                    <span className="rounded-full bg-border-light px-1.5 py-0.5 text-[10px] text-muted">
                      {day.items.length} {t.itineraryPanel.stops}
                    </span>
                    {expandedDay === day.dayNumber ? (
                      <ChevronUp className="size-4 text-muted" />
                    ) : (
                      <ChevronDown className="size-4 text-muted" />
                    )}
                  </div>
                </button>

                <AnimatePresence>
                  {expandedDay === day.dayNumber && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-1 px-5 pb-3">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDayDragEnd(day.dayNumber, day.items)}
                        >
                          <SortableContext
                            items={day.items.map((i) => i.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {day.items.map((item, index) => {
                              const linkedPin = pins.find(
                                (pin) =>
                                  pin.linkedTripItemId === item.id ||
                                  (item.location && pin.name === item.location.name),
                              );
                              const isSelected = linkedPin?.id === selectedPinId;
                              const canSelectOnMap = Boolean(linkedPin);
                              const incomingRoute = routeSegments.find(
                                (segment) =>
                                  segment.dayNumber === day.dayNumber && segment.toItemId === item.id,
                              );
                              const currentTransport = item.transport || incomingRoute?.transport || "Mixed";
                              const hasKnownTransport = transportOptions.some(
                                (option) => option.value === currentTransport,
                              );
                              const isEditingTitle = editingItem?.itemId === item.id;
                              const editingTitleValue =
                                isEditingTitle && editingItem ? editingItem.title : "";
                              const segId = incomingRoute?.id;
                              const routeDisplayMinutes =
                                incomingRoute && segId
                                  ? (segmentDirectionsMinutes[segId] ?? incomingRoute.estimatedMinutes)
                                  : 0;

                              return (
                                <SortableMapStop
                                  key={item.id}
                                  item={item}
                                  index={index}
                                  itemsLength={day.items.length}
                                  linkedPin={linkedPin}
                                  isSelected={isSelected}
                                  canSelectOnMap={canSelectOnMap}
                                  incomingRoute={incomingRoute}
                                  routeDisplayMinutes={routeDisplayMinutes}
                                  currentTransport={currentTransport}
                                  hasKnownTransport={hasKnownTransport}
                                  isEditingTitle={isEditingTitle}
                                  editingTitle={editingTitleValue}
                                  onSelectPin={() => linkedPin && setSelectedPinId(linkedPin.id)}
                                  onTransportChange={(value) =>
                                    updateItineraryItemTransport(day.dayNumber, item.id, value)
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
                                />
                              );
                            })}
                          </SortableContext>
                        </DndContext>

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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-border bg-surface-elevated/50 p-4">
            <div className="flex items-start gap-2 rounded-2xl border border-secondary/35 bg-peach-light/50 p-3 text-xs text-muted">
              <CalendarPlus className="mt-0.5 size-4 text-primary" />
              {t.itineraryPanel.footerHint}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
