"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  pendingLabel?: string;
  variant?: "danger" | "primary";
  onCancel: () => void;
  onConfirm: () => void;
};

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  pendingLabel,
  variant = "primary",
  onCancel,
  onConfirm,
}: Props) {
  const isDanger = variant === "danger";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/25 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !pending && onCancel()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-confirm-heading"
            aria-describedby="site-confirm-description"
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full",
                    isDanger ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary",
                  )}
                >
                  <AlertTriangle className="size-5" aria-hidden />
                </span>
                <h2 id="site-confirm-heading" className="font-semibold text-foreground">
                  {title}
                </h2>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={onCancel}
                className="rounded-lg p-1 text-muted hover:bg-border-light disabled:opacity-50"
                aria-label={cancelLabel}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <p id="site-confirm-description" className="text-sm leading-6 text-muted">
              {description}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onCancel}
                className="rounded-xl border border-border-light bg-surface px-4 py-2 text-xs font-medium text-muted hover:bg-cream/50 disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onConfirm}
                className={cn(
                  "rounded-xl px-4 py-2 text-xs font-medium text-white disabled:opacity-50",
                  isDanger ? "bg-danger hover:bg-danger/90" : "bg-primary hover:bg-primary-dark",
                )}
              >
                {pending ? pendingLabel || confirmLabel : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(ConfirmDialog);
