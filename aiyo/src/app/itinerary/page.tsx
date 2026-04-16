"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  Clock,
  GripVertical,
  MapPin,
  Plus,
  Train,
  Trash2,
  X,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import { buildPinsFromTripPlan } from "@/services/mapSync";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";
import type { TripPlanDay, TripPlanItem } from "@/types";

const typeColors: Record<TripPlanItem["type"], string> = {
  attraction: "border-l-primary",
  restaurant: "border-l-secondary",
  shopping: "border-l-peach",
  activity: "border-l-lavender",
  transport: "border-l-tertiary",
  hotel: "border-l-muted",
};

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

const typeOptions: Array<{ value: TripPlanItem["type"]; label: string }> = [
  { value: "attraction", label: t.itineraryPanel.typeAttraction },
  { value: "restaurant", label: t.itineraryPanel.typeRestaurant },
  { value: "shopping", label: t.itineraryPanel.typeShopping },
  { value: "activity", label: t.itineraryPanel.typeActivity },
  { value: "transport", label: t.itineraryPanel.typeTransport },
  { value: "hotel", label: t.itineraryPanel.typeHotel },
];

function SortableActivityItem({
  item,
  dayNumber,
  itemIndex,
  itemsLength,
  removeItineraryItem,
}: {
  item: TripPlanItem;
  dayNumber: number;
  itemIndex: number;
  itemsLength: number;
  removeItineraryItem: (dayNumber: number, itemId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: "relative" as const,
  };

  const colorClass = typeColors[item.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-xl border-l-4 hover:bg-cream/40 transition-colors group bg-surface",
        colorClass,
        isDragging && "shadow-soft-lg border border-primary/20 bg-cream/70 opacity-90",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="pt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab hover:text-primary focus:outline-none touch-none"
      >
        <GripVertical className="size-4 text-muted" />
      </div>

      <div className="flex flex-col items-center gap-1 min-w-[50px]">
        <span className="text-xs font-mono font-semibold text-primary bg-primary/8 px-2 py-0.5 rounded-md">
          {item.time}
        </span>
        {itemIndex < itemsLength - 1 && item.transport && (
          <div className="flex items-center gap-1 text-[10px] text-muted mt-1">
            <Train className="size-3" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
          <span className="text-[10px] px-1.5 py-0.5 bg-border-light text-muted rounded-full">
            {typeLabel(item.type)}
          </span>
        </div>
        {item.transport && (
          <p className="text-xs text-muted flex items-center gap-1 mb-1">
            <Train className="size-3" />
            {item.transport}
          </p>
        )}
        {item.notes && <p className="text-xs text-muted mb-1">{item.notes}</p>}
        {item.location && (
          <p className="text-[11px] text-primary/70 flex items-center gap-1 mt-1">
            <MapPin className="size-3" />
            {item.location.name}
          </p>
        )}
      </div>

      <button
        onClick={() => removeItineraryItem(dayNumber, item.id)}
        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 relative z-20"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export default function ItineraryPage() {
  const {
    itinerary,
    destination,
    days,
    budget,
    lastUpdatedAt,
    addDay,
    addItineraryItem,
    removeItineraryItem,
    reorderItineraryItem,
  } = useTripStore();
  const setPins = useMapStore((state) => state.setPins);
  const [addingToDay, setAddingToDay] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("10:00");
  const [newType, setNewType] = useState<TripPlanItem["type"]>("attraction");
  const [newNotes, setNewNotes] = useState("");
  const [syncing, setSyncing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleAddItem(dayNumber: number) {
    if (!newTitle.trim()) {
      return;
    }
    addItineraryItem(dayNumber, {
      id: `item_new_${Date.now()}`,
      dayNumber,
      time: newTime,
      title: newTitle.trim(),
      type: newType,
      notes: newNotes.trim() || undefined,
      source: "manual",
    });
    setNewTitle("");
    setNewTime("10:00");
    setNewType("attraction");
    setNewNotes("");
    setAddingToDay(null);
  }

  function handleDragEnd(
    event: DragEndEvent,
    dayNumber: number,
    items: TripPlanItem[],
  ) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      reorderItineraryItem(dayNumber, oldIndex, newIndex);
    }
  }

  function syncToMap() {
    setSyncing(true);
    setPins(buildPinsFromTripPlan(itinerary));
    window.setTimeout(() => setSyncing(false), 300);
  }

  return (
    <div className="min-h-screen p-6 lg:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="size-6 text-primary" />
              {t.itineraryPage.title}
            </h1>
            <p className="text-sm text-muted mt-1">
              {destination} · {days}
              {t.itineraryPage.metaDays} · NT${budget.toLocaleString()}
            </p>
            {lastUpdatedAt && (
              <p className="text-xs text-muted mt-1">
                {t.itineraryPage.updatedPrefix}{" "}
                {new Date(lastUpdatedAt).toLocaleString("zh-TW")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={syncToMap}
              className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm font-medium hover:bg-primary/20 transition-colors cursor-pointer"
            >
              {syncing ? t.itineraryPage.syncing : t.itineraryPage.syncMap}
            </button>
            <button
              onClick={addDay}
              className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors cursor-pointer flex items-center gap-2 hover:shadow-md"
            >
              <Plus className="size-4" />
              {t.itineraryPage.addDay}
            </button>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-col gap-6">
        {itinerary.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-6 py-12 text-center">
            <p className="text-base font-medium text-foreground">{t.itinerary.emptyTitle}</p>
            <p className="mt-2 text-sm text-muted">{t.itinerary.emptyHint}</p>
            <p className="mt-2 text-xs text-muted">{t.itineraryPage.emptyStateHint}</p>
            <button
              type="button"
              onClick={addDay}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark cursor-pointer"
            >
              <Plus className="size-4" />
              {t.itineraryPage.addDay}
            </button>
          </div>
        )}
        {itinerary.map((day: TripPlanDay, dayIndex) => (
          <motion.div
            key={day.dayNumber}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: dayIndex * 0.06 }}
            className="bg-surface rounded-2xl shadow-soft overflow-hidden border border-border-light relative z-10"
          >
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-primary/5 to-transparent border-b border-border-light">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                  {t.itineraryPage.dayBadge.replace("{n}", String(day.dayNumber))}
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">
                    {t.itineraryPage.dayHeading.replace("{n}", String(day.dayNumber))}
                  </h2>
                  {day.theme && <p className="text-xs text-muted mt-0.5">{day.theme}</p>}
                </div>
              </div>
              <span className="text-xs text-muted bg-cream px-2.5 py-1 rounded-full">
                {day.items.length}
                {t.itineraryPage.stops}
              </span>
            </div>

            <div className="p-4 flex flex-col gap-2 relative">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, day.dayNumber, day.items)}
              >
                <SortableContext
                  items={day.items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-2">
                    {day.items.map((item, index) => (
                      <SortableActivityItem
                        key={item.id}
                        item={item}
                        dayNumber={day.dayNumber}
                        itemIndex={index}
                        itemsLength={day.items.length}
                        removeItineraryItem={removeItineraryItem}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <AnimatePresence>
                {addingToDay === day.dayNumber && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-1"
                  >
                    <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Plus className="size-4 text-primary" />
                          {t.itineraryPage.addBlockTitle}
                        </h4>
                        <button
                          onClick={() => setAddingToDay(null)}
                          className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-border-light transition-colors cursor-pointer"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          value={newTitle}
                          onChange={(event) => setNewTitle(event.target.value)}
                          placeholder={t.itineraryPage.activityTitlePh}
                          className="col-span-2 px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              handleAddItem(day.dayNumber);
                            }
                          }}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 text-muted" />
                          <input
                            type="time"
                            value={newTime}
                            onChange={(event) => setNewTime(event.target.value)}
                            className="flex-1 px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                        <select
                          value={newType}
                          onChange={(event) =>
                            setNewType(event.target.value as TripPlanItem["type"])
                          }
                          className="px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                        >
                          {typeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        value={newNotes}
                        onChange={(event) => setNewNotes(event.target.value)}
                        placeholder={t.itineraryPage.notesPh}
                        className="px-3 py-2 rounded-xl border border-border bg-surface text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleAddItem(day.dayNumber);
                          }
                        }}
                      />
                      <button
                        onClick={() => handleAddItem(day.dayNumber)}
                        disabled={!newTitle.trim()}
                        className="flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check className="size-4" />
                        {t.itineraryPage.saveItem}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {addingToDay !== day.dayNumber && (
                <button
                  onClick={() => {
                    setAddingToDay(day.dayNumber);
                    setNewTitle("");
                    setNewNotes("");
                  }}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted hover:text-primary text-sm transition-all cursor-pointer mt-1"
                >
                  <Plus className="size-4" />
                  {t.itineraryPage.addItemToDay.replace("{n}", String(day.dayNumber))}
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
