"use client";

import { memo } from "react";
import { Check, Clock, Loader2, Plus, X } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import type { TripPlanItem } from "@/types";
import { activityTypeOptions } from "./itineraryUi";

export type AddActivityDraft = {
  title: string;
  time: string;
  location: string;
  type: TripPlanItem["type"];
  notes: string;
};

type Props = {
  draft: AddActivityDraft;
  saving?: boolean;
  onDraftChange: (draft: AddActivityDraft) => void;
  onSave: () => void;
  onCancel: () => void;
};

function AddActivityForm({ draft, saving = false, onDraftChange, onSave, onCancel }: Props) {
  function updateDraft(patch: Partial<AddActivityDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  function saveOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !saving) {
      onSave();
    }
  }

  return (
    <div className="overflow-hidden">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Plus className="size-4 text-primary" />
            {t.itineraryPage.addBlockTitle}
          </h4>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-border-light hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-xs font-medium text-muted">
            {t.itineraryPage.activityTitle}
            <input
              data-testid="activity-title-input"
              value={draft.title}
              onChange={(event) => updateDraft({ title: event.target.value })}
              placeholder={t.itineraryPage.activityTitlePh}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={saveOnEnter}
              autoFocus
            />
          </label>
          <label className="text-xs font-medium text-muted">
            {t.itineraryPage.activityTime}
            <div className="mt-1 flex items-center gap-2">
              <Clock className="size-4 text-muted" />
              <input
                data-testid="activity-time-input"
                type="time"
                value={draft.time}
                onChange={(event) => updateDraft({ time: event.target.value })}
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </label>
          <label className="text-xs font-medium text-muted">
            {t.itineraryPage.activityType}
            <select
              data-testid="activity-type-select"
              value={draft.type}
              onChange={(event) => updateDraft({ type: event.target.value as TripPlanItem["type"] })}
              className="mt-1 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
              data-testid="activity-location-input"
              value={draft.location}
              onChange={(event) => updateDraft({ location: event.target.value })}
              placeholder={t.itineraryPage.activityLocationPh}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={saveOnEnter}
            />
          </label>
          <label className="text-xs font-medium text-muted">
            {t.itineraryPage.notesPh}
            <input
              data-testid="activity-notes-input"
              value={draft.notes}
              onChange={(event) => updateDraft({ notes: event.target.value })}
              placeholder={t.itineraryPage.notesPh}
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
              onKeyDown={saveOnEnter}
            />
          </label>
          <button
            type="button"
            data-testid="activity-save-button"
            onClick={onSave}
            disabled={!draft.title.trim() || saving}
            className="sm:col-span-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" />}
            {saving ? t.itineraryPage.addActivityLocating : t.itineraryPage.saveItem}
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(AddActivityForm);
