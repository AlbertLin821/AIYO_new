"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  label: string;
  value: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function PromptDialog({
  open,
  title,
  label,
  value,
  placeholder,
  confirmLabel,
  cancelLabel,
  pending = false,
  onValueChange,
  onCancel,
  onConfirm,
}: Props) {
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
            aria-labelledby="site-prompt-heading"
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-soft-lg"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="site-prompt-heading" className="font-semibold text-foreground">
                {title}
              </h2>
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
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              <div>
                <label htmlFor="site-prompt-input" className="mb-2 block text-xs text-muted">
                  {label}
                </label>
                <input
                  id="site-prompt-input"
                  value={value}
                  onChange={(event) => onValueChange(event.target.value)}
                  placeholder={placeholder}
                  disabled={pending}
                  className="w-full rounded-xl border border-border-light bg-cream/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 disabled:opacity-60"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={onCancel}
                  className="rounded-xl border border-border-light bg-surface px-4 py-2 text-xs font-medium text-muted hover:bg-cream/50 disabled:opacity-50"
                >
                  {cancelLabel}
                </button>
                <button
                  type="submit"
                  disabled={pending || !value.trim()}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {confirmLabel}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(PromptDialog);
