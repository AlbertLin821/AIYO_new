"use client";

import { memo } from "react";
import { Plus, MousePointer2 } from "lucide-react";
import type { DragEndEvent } from "@dnd-kit/core";
import { zhTW as t } from "@/locales/zh-TW";
import type { EditingPresence, TripPlanDay, TripPlanItem } from "@/types";
import ItineraryCollaborationSidebar from "./ItineraryCollaborationSidebar";
import ItineraryDayCard from "./ItineraryDayCard";
import { presenceActionLabel } from "./itineraryUi";
import type { AddActivityDraft } from "./AddActivityForm";

type Props = {
  itinerary: TripPlanDay[];
  tripId: string | null;
  isAuthenticated: boolean;
  showCollaboratorCursors: boolean;
  canEdit: boolean;
  recoveringTrip: boolean;
  addingToDay: number | null;
  addDraft: AddActivityDraft;
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
  onReorderItem: (event: DragEndEvent, dayNumber: number, items: TripPlanItem[]) => void;
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
  onReorderItem,
}: Props) {
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
                  canEdit={canEdit}
                  addingToDay={addingToDay}
                  addDraft={addDraft}
                  onAddDraftChange={onAddDraftChange}
                  onStartAddActivity={onStartAddActivity}
                  onCancelAddActivity={onCancelAddActivity}
                  onSaveAddActivity={onSaveAddActivity}
                  onInsertDayAfter={onInsertDayAfter}
                  onRemoveDay={onRemoveDay}
                  onRemoveItem={onRemoveItem}
                  onUpdateItem={onUpdateItem}
                  onReorderItem={onReorderItem}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
        <ItineraryCollaborationSidebar />
      </aside>
    </div>
  );
}

export default memo(ItineraryEditorSection);
