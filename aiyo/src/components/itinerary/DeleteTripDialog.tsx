"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
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
    <AnimatePresence>
      {target && (
        <motion.div
          data-testid="library-delete-trip-dialog"
          role="presentation"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/25 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !deleting && onCancel()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-delete-trip-heading"
            aria-describedby="library-delete-trip-description"
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-danger/10 text-danger">
                  <Trash2 className="size-5" aria-hidden />
                </span>
                <div>
                  <h2 id="library-delete-trip-heading" className="font-semibold text-foreground">
                    {t.itineraryPage.deleteTripDialogTitle}
                  </h2>
                  <p className="mt-1 text-xs text-muted">{target.title}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={onCancel}
                className="rounded-lg p-1 text-muted hover:bg-border-light disabled:opacity-50"
                aria-label={t.itineraryPage.deleteTripCancel}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <p id="library-delete-trip-description" className="text-sm leading-6 text-muted">
              {t.itineraryPage.deleteTripConfirm.replace("{title}", target.title)}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={onCancel}
                className="rounded-xl border border-border-light bg-surface px-4 py-2 text-xs font-medium text-muted hover:bg-cream/50 disabled:opacity-50"
              >
                {t.itineraryPage.deleteTripCancel}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={onConfirm}
                className="rounded-xl bg-danger px-4 py-2 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {deleting ? t.itineraryPage.deleteTripDeleting : t.itineraryPage.deleteTripConfirmAction}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(DeleteTripDialog);
