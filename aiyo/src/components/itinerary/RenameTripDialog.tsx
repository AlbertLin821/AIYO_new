"use client";

import { memo, type RefObject } from "react";
import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { zhTW as t } from "@/locales/zh-TW";
import type { ItineraryListItem } from "@/lib/itinerary-sort";

type Props = {
  target: ItineraryListItem | null;
  draft: string;
  coverUrl: string | null;
  saving: boolean;
  coverHint: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDraftChange: (value: string) => void;
  onCoverFiles: (files: FileList | null) => void;
  onClearCover: () => void;
  onSave: () => void;
  onClose: () => void;
};

function RenameTripDialog({
  target,
  draft,
  coverUrl,
  saving,
  coverHint,
  fileInputRef,
  onDraftChange,
  onCoverFiles,
  onClearCover,
  onSave,
  onClose,
}: Props) {
  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) {
          onClose();
        }
      }}
    >
      <DialogContent
        data-testid="library-rename-trip-dialog"
        showCloseButton={!saving}
        className="rounded-2xl border-border-light bg-surface shadow-soft-lg sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle id="library-rename-trip-heading" className="font-semibold">
            {t.itineraryPage.renameTripDialogTitle}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div>
            <Label htmlFor="library-rename-trip-input" className="mb-2 block text-xs text-muted">
              {t.itineraryPage.renameTripLabel}
            </Label>
            <Input
              id="library-rename-trip-input"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={t.itineraryPage.renameTripPlaceholder}
              disabled={saving}
              autoComplete="off"
              className="rounded-xl border-border-light bg-cream/40"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">{t.itineraryPage.tripCoverLabel}</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-border-light bg-surface-elevated">
                {coverUrl ? (
                  <Image
                    src={coverUrl}
                    alt={t.itineraryPage.tripCoverAlt}
                    fill
                    className="object-cover"
                    unoptimized
                    sizes="128px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted">
                    {t.itineraryPage.tripCoverChoose}
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => onCoverFiles(event.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                className="rounded-lg border-border bg-surface text-xs"
              >
                <ImagePlus className="size-4 shrink-0" aria-hidden />
                {t.itineraryPage.tripCoverChoose}
              </Button>
              {coverUrl ? (
                <button
                  type="button"
                  onClick={onClearCover}
                  disabled={saving}
                  className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
                >
                  {t.itineraryPage.tripCoverRemove}
                </button>
              ) : null}
            </div>
            {coverHint ? <p className="mt-2 text-xs text-danger">{coverHint}</p> : null}
          </div>
          <DialogFooter className="gap-2 border-0 bg-transparent p-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
              className="rounded-xl border-border-light"
            >
              {t.itineraryPage.renameTripCancel}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary-dark"
            >
              {t.itineraryPage.renameTripSave}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default memo(RenameTripDialog);
