"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Plus, MousePointer2 } from "lucide-react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { zhTW as t } from "@/locales/zh-TW";
import type { EditingPresence, TripPlanDay, TripPlanItem } from "@/types";
import ActivityDragPreview, { ITINERARY_DRAG_DROP_ANIMATION } from "./ActivityDragPreview";
import ItineraryCollaborationSidebar from "./ItineraryCollaborationSidebar";
import ItineraryDayCard from "./ItineraryDayCard";
import { presenceActionLabel } from "./itineraryUi";
import type { AddActivityDraft } from "./AddActivityForm";
import {
  findItineraryItemById,
  findItineraryItemDayNumber,
  parseItineraryDayContainerId,
  resolveItineraryDragTarget,
} from "./itineraryDragUtils";

type Props = {
  itinerary: TripPlanDay[];
  tripId: string | null;
  isAuthenticated: boolean;
  showCollaboratorCursors: boolean;
  canEdit: boolean;
  recoveringTrip: boolean;
  addingToDay: number | null;
  addDraft: AddActivityDraft;
  addActivitySaving?: boolean;
  othersEditorPresence: EditingPresence[];
  onMouseMove: (clientX: number, clientY: number, rect: DOMRect) => void;
  onMouseLeave: () => void;
  onAddDay: () => void;
  onAddDraftChange: (draft: AddActivityDraft) => void;
  onStartAddActivity: (dayNumber: number) => void;
  onCancelAddActivity: () => void;
  onSaveAddActivity: (dayNumber: number) => void;
  onInsertDayAfter: (dayNumber: number) => void;
  onRemoveDay: (dayNumber: number, displayOrdinal: number) => void;
  onRemoveItem: (dayNumber: number, itemId: string) => void;
  onUpdateItem: (dayNumber: number, itemId: string, patch: Partial<TripPlanItem>) => void;
  onReorderWithinDay: (dayNumber: number, oldIndex: number, newIndex: number) => void;
  onMoveItemBetweenDays: (
    fromDayNumber: number,
    toDayNumber: number,
    itemId: string,
    toIndex: number,
  ) => void;
};

function ItineraryEditorSection({
  itinerary,
  tripId,
  isAuthenticated,
  showCollaboratorCursors,
  canEdit,
  recoveringTrip,
  addingToDay,
  addDraft,
  addActivitySaving = false,
  othersEditorPresence,
  onMouseMove,
  onMouseLeave,
  onAddDay,
  onAddDraftChange,
  onStartAddActivity,
  onCancelAddActivity,
  onSaveAddActivity,
  onInsertDayAfter,
  onRemoveDay,
  onRemoveItem,
  onUpdateItem,
  onReorderWithinDay,
  onMoveItemBetweenDays,
}: Props) {
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});
  const [activeDragItem, setActiveDragItem] = useState<TripPlanItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const firstDay = itinerary[0]?.dayNumber;
    if (!firstDay) {
      setExpandedDays({});
      return;
    }
    setExpandedDays((prev) => {
      const next: Record<number, boolean> = {};
      for (const day of itinerary) {
        next[day.dayNumber] = prev[day.dayNumber] ?? day.dayNumber === firstDay;
      }
      return next;
    });
  }, [tripId, itinerary]);

  const toggleDayExpanded = useCallback((dayNumber: number) => {
    setExpandedDays((prev) => ({ ...prev, [dayNumber]: !prev[dayNumber] }));
  }, []);

  const handleStartAddActivity = useCallback(
    (dayNumber: number) => {
      setExpandedDays((prev) => ({ ...prev, [dayNumber]: true }));
      onStartAddActivity(dayNumber);
    },
    [onStartAddActivity],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (!canEdit || !event.over) {
        return;
      }
      const overId = String(event.over.id);
      const target = resolveItineraryDragTarget(itinerary, overId);
      if (!target) {
        return;
      }
      setExpandedDays((prev) => ({ ...prev, [target.dayNumber]: true }));
    },
    [canEdit, itinerary],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!canEdit) {
        return;
      }
      setActiveDragItem(findItineraryItemById(itinerary, String(event.active.id)));
    },
    [canEdit, itinerary],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragItem(null);
      if (!canEdit) {
        return;
      }
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

      const fromDay = itinerary.find((day) => day.dayNumber === fromDayNumber);
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
          onReorderWithinDay(fromDayNumber, oldIndex, newIndex);
        }
        return;
      }

      onMoveItemBetweenDays(fromDayNumber, target.dayNumber, activeId, target.index);
    },
    [canEdit, itinerary, onMoveItemBetweenDays, onReorderWithinDay],
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div
        className="relative min-w-0 space-y-5"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onMouseMove(event.clientX, event.clientY, rect);
        }}
        onMouseLeave={onMouseLeave}
      >
        {showCollaboratorCursors && othersEditorPresence.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
            {othersEditorPresence.map((entry) => (
              <div
                key={entry.userId}
                data-testid={`presence-cursor-${entry.userId}`}
                className="pointer-events-none absolute z-10"
                style={{
                  left: `${entry.cursorPosition.x}%`,
                  top: `${entry.cursorPosition.y}%`,
                  transform: "translate(-4px, -4px)",
                }}
              >
                <MousePointer2 className="size-4 -rotate-12" style={{ color: entry.color }} fill={entry.color} />
                <div
                  className="absolute left-4 top-3 flex max-w-[min(280px,48vw)] items-center gap-2 rounded-full border border-white/35 px-2.5 py-1 text-[10px] font-medium leading-snug text-white shadow-lg backdrop-blur-sm"
                  style={{ backgroundColor: `${entry.color}E6` }}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white/20 text-[9px] font-semibold uppercase">
                    {entry.userName.slice(0, 1)}
                  </span>
                  <span className="whitespace-nowrap">{entry.userName}</span>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-white/80" />
                  <span className="whitespace-nowrap text-white/90">{presenceActionLabel(entry.activeSection)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t.itineraryPage.currentTripSummary}</p>
            <h2 className="text-xl font-semibold text-foreground">{t.itineraryPage.editorSectionTitle}</h2>
          </div>
          {canEdit && (
            <button
              type="button"
              data-testid="add-day-button"
              onClick={onAddDay}
              disabled={recoveringTrip}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              {recoveringTrip ? t.itineraryPage.recoverTripLoading : t.itineraryPage.addDay}
            </button>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div id="itinerary-editor" data-testid="itinerary-editor" className="flex flex-col gap-6">
            {isAuthenticated && !tripId ? (
              <div className="rounded-2xl border border-dashed border-border-light bg-surface px-5 py-8">
                <p className="text-base font-medium text-foreground">{t.itineraryPage.noActiveTripTitle}</p>
                <p className="mt-2 text-sm text-muted">{t.itineraryPage.noActiveTripHint}</p>
              </div>
            ) : (
              <>
                {itinerary.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border-light bg-surface px-5 py-8">
                    <p className="text-base font-medium text-foreground">{t.itinerary.emptyTitle}</p>
                    <p className="mt-2 text-sm text-muted">{t.itinerary.emptyHint}</p>
                    <p className="mt-1 text-xs text-muted-light">{t.itineraryPage.emptyStateHint}</p>
                  </div>
                )}
                {itinerary.map((day, dayIndex) => (
                  <ItineraryDayCard
                    key={day.dayNumber}
                    day={day}
                    displayOrdinal={dayIndex + 1}
                    dayIndex={dayIndex}
                    totalDays={itinerary.length}
                    expanded={expandedDays[day.dayNumber] ?? false}
                    onToggleExpanded={() => toggleDayExpanded(day.dayNumber)}
                    crossDayDragActive={Boolean(activeDragItem)}
                    canEdit={canEdit}
                    addingToDay={addingToDay}
                    addDraft={addDraft}
                    addActivitySaving={addActivitySaving}
                    onAddDraftChange={onAddDraftChange}
                    onStartAddActivity={handleStartAddActivity}
                    onCancelAddActivity={onCancelAddActivity}
                    onSaveAddActivity={onSaveAddActivity}
                    onInsertDayAfter={onInsertDayAfter}
                    onRemoveDay={onRemoveDay}
                    onRemoveItem={onRemoveItem}
                    onUpdateItem={onUpdateItem}
                  />
                ))}
              </>
            )}
          </div>
          <DragOverlay dropAnimation={ITINERARY_DRAG_DROP_ANIMATION}>
            {activeDragItem ? <ActivityDragPreview item={activeDragItem} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
        <ItineraryCollaborationSidebar />
      </aside>
    </div>
  );
}

export default memo(ItineraryEditorSection);
