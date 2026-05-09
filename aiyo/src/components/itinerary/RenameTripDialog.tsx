"use client";

import { memo, type RefObject } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus, X } from "lucide-react";
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
    <AnimatePresence>
      {target && (
        <motion.div
          data-testid="library-rename-trip-dialog"
          role="presentation"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !saving && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-rename-trip-heading"
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="library-rename-trip-heading" className="font-semibold text-foreground">
                {t.itineraryPage.renameTripDialogTitle}
              </h2>
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg p-1 text-muted hover:bg-border-light disabled:opacity-50"
                aria-label={t.itineraryPage.renameTripCancel}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                onSave();
              }}
            >
              <div>
                <label htmlFor="library-rename-trip-input" className="mb-2 block text-xs text-muted">
                  {t.itineraryPage.renameTripLabel}
                </label>
                <input
                  id="library-rename-trip-input"
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  placeholder={t.itineraryPage.renameTripPlaceholder}
                  disabled={saving}
                  className="w-full rounded-xl border border-border-light bg-cream/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 disabled:opacity-60"
                  autoComplete="off"
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
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-cream/50 disabled:opacity-50"
                  >
                    <ImagePlus className="size-4 shrink-0" aria-hidden />
                    {t.itineraryPage.tripCoverChoose}
                  </button>
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={onClose}
                  className="rounded-xl border border-border-light bg-surface px-4 py-2 text-xs font-medium text-muted hover:bg-cream/50 disabled:opacity-50"
                >
                  {t.itineraryPage.renameTripCancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {t.itineraryPage.renameTripSave}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(RenameTripDialog);
