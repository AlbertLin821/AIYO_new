"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, MapPin, Sparkles, X } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";

export default function OnboardingModal() {
  const { showOnboarding, setShowOnboarding } = useUIStore();
  const { setDestination, setDays } = useTripStore();
  const { setFirstVisit } = useUserStore();
  const [destinationInput, setDestinationInput] = useState("");
  const [daysInput, setDaysInput] = useState("");

  function finish(skip: boolean) {
    if (!skip) {
      if (destinationInput.trim()) {
        setDestination(destinationInput.trim());
      }
      if (daysInput.trim()) {
        setDays(parseInt(daysInput, 10) || 5);
      }
    }
    setFirstVisit(false);
    setShowOnboarding(false);
  }

  return (
    <AnimatePresence>
      {showOnboarding && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={() => finish(true)}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-surface shadow-soft-lg"
          >
            <button
              onClick={() => finish(true)}
              className="absolute right-4 top-4 z-10 cursor-pointer rounded-full p-1.5 text-muted transition-colors hover:bg-border-light hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="h-2 bg-gradient-to-r from-primary via-lavender to-secondary" />

            <div className="p-8 pt-6">
              <div className="mb-8 text-center">
                <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-lavender/15">
                  <Sparkles className="size-7 text-primary" />
                </div>
                <h2 className="mb-2 text-2xl font-bold text-foreground">{t.onboarding.welcomeTitle}</h2>
                <p className="text-sm leading-relaxed text-muted">{t.onboarding.welcomeBody}</p>
              </div>

              <div className="flex flex-col gap-5">
                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <MapPin className="size-4 text-secondary" />
                    {t.onboarding.destination}
                  </label>
                  <input
                    type="text"
                    value={destinationInput}
                    onChange={(event) => setDestinationInput(event.target.value)}
                    placeholder={t.onboarding.destinationPh}
                    className="w-full rounded-xl border border-border bg-cream/50 px-4 py-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <CalendarDays className="size-4 text-primary" />
                    {t.onboarding.tripDays}
                  </label>
                  <input
                    type="number"
                    value={daysInput}
                    onChange={(event) => setDaysInput(event.target.value)}
                    placeholder={t.onboarding.daysPlaceholder}
                    min={1}
                    max={30}
                    className="w-full rounded-xl border border-border bg-cream/50 px-4 py-3 text-sm text-foreground transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <button
                  onClick={() => finish(true)}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-border-light hover:text-foreground"
                >
                  {t.onboarding.skip}
                </button>
                <button
                  onClick={() => finish(false)}
                  className="cursor-pointer rounded-xl bg-gradient-to-r from-primary to-primary-dark px-6 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
                >
                  {t.onboarding.start}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
