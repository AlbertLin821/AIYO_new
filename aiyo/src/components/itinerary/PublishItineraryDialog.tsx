"use client";

import { memo } from "react";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zhTW as t } from "@/locales/zh-TW";

type Props = {
  open: boolean;
  isPublished: boolean;
  isPublishing: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function PublishItineraryDialog({
  open,
  isPublished,
  isPublishing,
  onClose,
  onConfirm,
}: Props) {
  const copy = t.publishDialog;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPublishing) {
          onClose();
        }
      }}
    >
      <DialogContent
        data-testid="publish-itinerary-dialog"
        showCloseButton={!isPublishing}
        className="rounded-2xl border-border-light bg-surface shadow-soft-lg sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Globe className="size-4 text-primary" />
            {isPublished ? copy.republishTitle : copy.title}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted">{copy.snapshotHint}</p>

        <div className="rounded-xl border border-border-light bg-cream/40 px-4 py-3">
          <p className="text-xs font-semibold text-foreground">{copy.hiddenTitle}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
            {copy.hiddenItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted">{copy.contactHint}</p>

        <DialogFooter className="mt-2 gap-2 border-0 bg-transparent p-0 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isPublishing}
            onClick={onClose}
            className="rounded-xl border-border-light"
          >
            {copy.cancel}
          </Button>
          <Button
            type="button"
            disabled={isPublishing}
            onClick={onConfirm}
            data-testid="publish-itinerary-confirm"
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary-dark"
          >
            {isPublishing && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isPublished ? copy.republishConfirm : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default memo(PublishItineraryDialog);
