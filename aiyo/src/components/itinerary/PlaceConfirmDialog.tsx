"use client";

import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlaceThumbnail from "@/components/map/PlaceThumbnail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";
import type { PlaceSuggestion } from "@/types/geocode";

type Props = {
  open: boolean;
  query: string;
  suggestions: PlaceSuggestion[];
  pending?: boolean;
  onSelect: (suggestion: PlaceSuggestion) => void;
  onSkip: () => void;
};

export default function PlaceConfirmDialog({
  open,
  query,
  suggestions,
  pending = false,
  onSelect,
  onSkip,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !pending) {
          onSkip();
        }
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        className="flex max-h-[80vh] w-full max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border-border-light bg-surface p-0"
      >
        <DialogHeader className="border-b border-border-light px-5 py-4">
          <DialogTitle className="text-base font-bold">{t.itineraryPage.placeConfirmTitle}</DialogTitle>
          <DialogDescription className="text-sm text-muted">
            {t.itineraryPage.placeConfirmDesc.replace("{query}", query)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {suggestions.map((suggestion, index) => {
            const key = suggestion.placeId || `${suggestion.lat},${suggestion.lng},${index}`;
            return (
              <button
                key={key}
                type="button"
                disabled={pending}
                onClick={() => onSelect(suggestion)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border border-border-light bg-surface px-4 py-3 text-left transition-colors",
                  "hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <PlaceThumbnail
                  src={suggestion.thumbnail ?? suggestion.photoUrl}
                  placeId={suggestion.placeId}
                  alt={suggestion.placeName}
                  placeholder=""
                  className="size-14 shrink-0 rounded-lg"
                  imageClassName="object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {suggestion.placeName}
                  </span>
                  {suggestion.formattedAddress ? (
                    <span className="mt-1 block text-xs leading-relaxed text-muted">
                      {suggestion.formattedAddress}
                    </span>
                  ) : null}
                  {typeof suggestion.rating === "number" ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      {suggestion.rating.toFixed(1)}
                      {typeof suggestion.userRatingsTotal === "number"
                        ? ` (${suggestion.userRatingsTotal})`
                        : null}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="border-t border-border-light px-5 py-4 sm:justify-between">
          <Button type="button" variant="ghost" disabled={pending} onClick={onSkip}>
            {t.itineraryPage.placeConfirmSkip}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
