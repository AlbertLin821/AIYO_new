"use client";

import { memo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { ItineraryListItem } from "@/lib/itinerary-sort";

type Props = {
  target: ItineraryListItem | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteTripDialog({ target, deleting, onCancel, onConfirm }: Props) {
  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !deleting) {
          onCancel();
        }
      }}
    >
      <DialogContent
        data-testid="library-delete-trip-dialog"
        showCloseButton={!deleting}
        className="overflow-hidden rounded-2xl border-border-light bg-surface p-5 shadow-soft-lg sm:max-w-md"
      >
        <DialogHeader className="gap-3 pr-10">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Trash2 className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <DialogTitle id="library-delete-trip-heading" className="font-semibold">
                {t.itineraryPage.deleteTripDialogTitle}
              </DialogTitle>
              {target ? (
                <p className="text-xs text-muted">{target.title}</p>
              ) : null}
            </div>
          </div>
          {target ? (
            <DialogDescription id="library-delete-trip-description" className="leading-6">
              {t.itineraryPage.deleteTripConfirm.replace("{title}", target.title)}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse gap-2 border-0 bg-transparent p-0 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={onCancel}
            className="w-full min-w-0 rounded-xl border-border-light sm:w-auto"
          >
            {t.itineraryPage.deleteTripCancel}
          </Button>
          <Button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className={cn("w-full min-w-0 rounded-xl bg-danger text-white hover:bg-danger/90 sm:w-auto")}
          >
            {deleting ? t.itineraryPage.deleteTripDeleting : t.itineraryPage.deleteTripConfirmAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default memo(DeleteTripDialog);
