"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { useToastStore } from "@/stores/useToastStore";

const toneStyles = {
  info: {
    icon: Info,
    className: "border-border-light bg-surface text-foreground",
  },
  success: {
    icon: CheckCircle2,
    className: "border-tertiary/30 bg-tertiary/10 text-foreground",
  },
  error: {
    icon: AlertCircle,
    className: "border-danger/20 bg-danger/10 text-foreground",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-secondary/30 bg-secondary/10 text-foreground",
  },
};

export default function ToastViewport() {
  const { toasts, dismissToast } = useToastStore();

  return (
    <div
      className="pointer-events-none fixed z-[100] flex w-full max-w-sm flex-col gap-3 max-lg:inset-x-4 max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+12px)] max-lg:top-auto lg:right-4 lg:top-4"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const tone = toneStyles[toast.variant || "info"];
          const Icon = tone.icon;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-soft-lg ${tone.className}`}
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-1 text-xs text-muted">{toast.description}</p>
                  )}
                  {toast.actionLabel && toast.action && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.action?.();
                        dismissToast(toast.id);
                      }}
                      className="mt-2 text-xs font-medium text-primary hover:text-primary-dark"
                    >
                      {toast.actionLabel}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label={t.common.dismissToast}
                  className="rounded-full p-1 text-muted transition-colors hover:bg-border-light hover:text-foreground"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
