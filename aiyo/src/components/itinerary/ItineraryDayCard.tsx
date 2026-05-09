"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { TripPlanDay, TripPlanItem } from "@/types";
import AddActivityForm, { type AddActivityDraft } from "./AddActivityForm";
import SortableActivityItem from "./SortableActivityItem";

type Props = {
  day: TripPlanDay;
  displayOrdinal: number;
  dayIndex: number;
  totalDays: number;
  canEdit: boolean;
  addingToDay: number | null;
  addDraft: AddActivityDraft;
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

function ItineraryDayCard({
  day,
  displayOrdinal,
  dayIndex,
  totalDays,
  canEdit,
  addingToDay,
  addDraft,
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
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: dayIndex * 0.04 }}
      className="relative z-10 overflow-hidden rounded-2xl border border-border-light bg-surface shadow-soft"
    >
      <div className="group flex flex-col gap-3 border-b border-border-light bg-gradient-to-r from-primary/8 via-surface to-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-white">
            {t.itineraryPage.dayBadge.replace("{n}", String(displayOrdinal))}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground">
              {t.itineraryPage.dayHeading.replace("{n}", String(displayOrdinal))}
            </h2>
            {day.theme && !/^Day\s*\d+$/i.test(day.theme.trim()) ? (
              <p className="mt-0.5 truncate text-xs text-muted">{day.theme}</p>
            ) : (
              <p className="mt-0.5 text-xs text-muted">安排第 {displayOrdinal} 天的路線與活動順序</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-cream px-2.5 py-1 text-xs text-muted">
            {day.items.length}
            {t.itineraryPage.stops}
          </span>
          {canEdit && totalDays > 1 && (
            <button
              type="button"
              onClick={() => onRemoveDay(day.dayNumber, displayOrdinal)}
              aria-label={t.itineraryPage.deleteDayAria.replace("{n}", String(displayOrdinal))}
              title={t.itineraryPage.deleteDay}
              className="rounded-lg border border-border-light bg-surface p-2 text-muted opacity-70 transition-colors hover:border-danger/40 hover:text-danger group-hover:opacity-100"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex flex-col gap-3 p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => onReorderItem(event, day.dayNumber, day.items)}
        >
          <SortableContext items={day.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {day.items.map((item, index) => (
                <SortableActivityItem
                  key={item.id}
                  item={item}
                  dayNumber={day.dayNumber}
                  itemIndex={index}
                  itemsLength={day.items.length}
                  canEdit={canEdit}
                  onRemove={onRemoveItem}
                  onUpdate={onUpdateItem}
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
            >
              <AddActivityForm
                draft={addDraft}
                onDraftChange={onAddDraftChange}
                onSave={() => onSaveAddActivity(day.dayNumber)}
                onCancel={onCancelAddActivity}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {addingToDay !== day.dayNumber && canEdit && (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-testid="add-activity-button"
              aria-label={t.itineraryPage.stripSplitAddActivityHover}
              title={t.itineraryPage.stripSplitAddActivityHover}
              onClick={() => onStartAddActivity(day.dayNumber)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/35 bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Plus className="size-4" />
              {t.itineraryPage.stripSplitAddActivityHover}
            </button>
            <button
              type="button"
              data-testid="strip-add-day-button"
              aria-label={t.itineraryPage.stripSplitAddDayHover}
              title={t.itineraryPage.stripSplitAddDayHover}
              onClick={() => onInsertDayAfter(day.dayNumber)}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm font-medium text-muted transition-colors hover:border-primary/35 hover:bg-primary/5 hover:text-primary",
                dayIndex === totalDays - 1 && "sm:col-span-1",
              )}
            >
              <Plus className="size-4" />
              {t.itineraryPage.stripSplitAddDayHover}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default memo(ItineraryDayCard);
