"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Loader2, X } from "lucide-react";
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
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="publish-itinerary-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-foreground">
                <Globe className="size-4 text-primary" />
                {isPublished ? copy.republishTitle : copy.title}
              </h2>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-border-light">
                <X className="size-4" />
              </button>
            </div>

            <p className="text-sm text-muted">{copy.snapshotHint}</p>

            <div className="mt-4 rounded-xl border border-border-light bg-cream/40 px-4 py-3">
              <p className="text-xs font-semibold text-foreground">{copy.hiddenTitle}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
                {copy.hiddenItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <p className="mt-3 text-xs text-muted">{copy.contactHint}</p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPublishing}
                className="rounded-xl border border-border-light px-4 py-2 text-sm font-medium text-muted hover:bg-cream/50 disabled:opacity-60"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isPublishing}
                data-testid="publish-itinerary-confirm"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60"
              >
                {isPublishing && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {isPublished ? copy.republishConfirm : copy.confirm}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(PublishItineraryDialog);
