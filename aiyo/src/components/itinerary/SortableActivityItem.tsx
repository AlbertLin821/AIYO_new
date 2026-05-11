"use client";

import { memo, useState } from "react";
import { GripVertical, MapPin, PencilLine, Save, Train, Trash2, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { TripPlanItem } from "@/types";
import { activityTypeColors, activityTypeLabel, activityTypeOptions } from "./itineraryUi";

type EditDraft = {
  title: string;
  time: string;
  type: TripPlanItem["type"];
  notes: string;
  locationName: string;
  transport: string;
};

type Props = {
  item: TripPlanItem;
  dayNumber: number;
  itemIndex: number;
  itemsLength: number;
  canEdit: boolean;
  onRemove: (dayNumber: number, itemId: string) => void;
  onUpdate: (dayNumber: number, itemId: string, patch: Partial<TripPlanItem>) => void;
  tone?: "light" | "dark";
};

function toDraft(item: TripPlanItem): EditDraft {
  return {
    title: item.title,
    time: item.time,
    type: item.type,
    notes: item.notes ?? "",
    locationName: item.location?.name ?? "",
    transport: item.transport ?? "",
  };
}

function SortableActivityItem({
  item,
  dayNumber,
  itemIndex,
  itemsLength,
  canEdit,
  onRemove,
  onUpdate,
  tone = "light",
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(() => toDraft(item));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    position: "relative" as const,
  };

  const isDark = tone === "dark";
  const colorClass = activityTypeColors[item.type];

  function updateDraft(patch: Partial<EditDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function openEdit() {
    setDraft(toDraft(item));
    setIsEditing(true);
  }

  function saveEdit() {
    const title = draft.title.trim();
    if (!title) {
      return;
    }
    const locationName = draft.locationName.trim();
    onUpdate(dayNumber, item.id, {
      title,
      time: draft.time,
      type: draft.type,
      notes: draft.notes.trim() || undefined,
      transport: draft.transport.trim() || undefined,
      location: locationName
        ? {
            ...(item.location ?? {
              lat: 0,
              lng: 0,
              description: draft.notes.trim() || locationName,
            }),
            name: locationName,
            address: item.location?.address ?? locationName,
            description: draft.notes.trim() || item.location?.description || locationName,
          }
        : undefined,
    });
    setIsEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      data-testid="activity-card"
      style={style}
      className={cn(
        "group rounded-xl border border-border-light bg-surface transition-colors",
        "border-l-4",
        colorClass,
        isDark && "border-zinc-800 bg-zinc-900/90 text-zinc-100",
        isDragging &&
          (isDark
            ? "border-primary/30 bg-zinc-800 opacity-90"
            : "border-primary/20 bg-cream/70 shadow-soft-lg opacity-90"),
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          {...attributes}
          {...listeners}
          className={cn(
            "mt-1 rounded-lg p-1 opacity-55 transition-opacity cursor-grab focus:outline-none touch-none group-hover:opacity-100",
            isDark ? "hover:text-zinc-100" : "hover:bg-primary/5 hover:text-primary",
          )}
          title="拖曳排序"
        >
          <GripVertical className={cn("size-4", isDark ? "text-zinc-500" : "text-muted")} />
        </div>

        <div className="flex min-w-[56px] flex-col items-center gap-1">
          <span
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold font-mono",
              isDark ? "bg-zinc-800 text-orange-300" : "bg-primary/8 text-primary",
            )}
          >
            {item.time}
          </span>
          {itemIndex < itemsLength - 1 && <div className="h-8 w-px bg-border-light" aria-hidden />}
        </div>

        <button
          type="button"
          onClick={() => canEdit && openEdit()}
          disabled={!canEdit}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
          aria-label={`編輯活動 ${item.title}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("min-w-0 text-sm font-semibold", isDark ? "text-zinc-100" : "text-foreground")}>
              {item.title}
            </h3>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px]", isDark ? "bg-zinc-800 text-zinc-400" : "bg-border-light text-muted")}>
              {activityTypeLabel(item.type)}
            </span>
          </div>
          <div className="mt-2 grid gap-1 text-xs">
            {item.transport && (
              <p className={cn("flex items-center gap-1", isDark ? "text-zinc-400" : "text-muted")}>
                <Train className="size-3" />
                {item.transport}
              </p>
            )}
            {item.notes && <p className={cn(isDark ? "text-zinc-500" : "text-muted")}>{item.notes}</p>}
            {item.location && (
              <p className={cn("flex items-center gap-1", isDark ? "text-orange-400/90" : "text-primary/70")}>
                <MapPin className="size-3" />
                {item.location.name}
              </p>
            )}
          </div>
        </button>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              data-testid="activity-toolbar-edit"
              onClick={() => (isEditing ? setIsEditing(false) : openEdit())}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label={`編輯活動 ${item.title}`}
            >
              <PencilLine className="size-3.5" />
            </button>
            <button
              type="button"
              data-testid="activity-delete-button"
              aria-label={`刪除活動 ${item.title}`}
              onClick={() => onRemove(dayNumber, item.id)}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {isEditing && canEdit && (
        <div className="border-t border-border-light bg-cream/30 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 text-xs font-medium text-muted">
              {t.itineraryPage.activityTitle}
              <input
                data-testid="activity-edit-title-input"
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="text-xs font-medium text-muted">
              {t.itineraryPage.activityTime}
              <input
                type="time"
                value={draft.time}
                onChange={(event) => updateDraft({ time: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="text-xs font-medium text-muted">
              {t.itineraryPage.activityType}
              <select
                value={draft.type}
                onChange={(event) => updateDraft({ type: event.target.value as TripPlanItem["type"] })}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {activityTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted">
              {t.itineraryPage.activityLocation}
              <input
                value={draft.locationName}
                onChange={(event) => updateDraft({ locationName: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="text-xs font-medium text-muted">
              {t.itineraryPanel.segmentTransport}
              <input
                value={draft.transport}
                onChange={(event) => updateDraft({ transport: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="sm:col-span-2 text-xs font-medium text-muted">
              {t.itineraryPage.notesPh}
              <input
                value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(toDraft(item));
                  setIsEditing(false);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-border-light bg-surface px-3 py-2 text-xs font-medium text-muted hover:bg-cream/60"
              >
                <X className="size-3.5" />
                {t.itineraryPage.renameTripCancel}
              </button>
              <button
                type="button"
                data-testid="activity-edit-save-button"
                onClick={saveEdit}
                disabled={!draft.title.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                <Save className="size-3.5" />
                {t.itineraryPage.renameTripSave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(SortableActivityItem);
