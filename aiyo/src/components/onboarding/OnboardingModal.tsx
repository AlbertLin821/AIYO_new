'use client';

import { useState } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useTripStore } from '@/stores/useTripStore';
import { useUserStore } from '@/stores/useUserStore';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, CalendarDays, Sparkles, X } from 'lucide-react';

export default function OnboardingModal() {
  const { showOnboarding, setShowOnboarding } = useUIStore();
  const { setDestination, setDays } = useTripStore();
  const { setFirstVisit } = useUserStore();
  const [dest, setDest] = useState('');
  const [days, setDaysLocal] = useState('');

  const handleStart = () => {
    if (dest) setDestination(dest);
    if (days) setDays(parseInt(days) || 5);
    setFirstVisit(false);
    setShowOnboarding(false);
  };

  const handleSkip = () => {
    setFirstVisit(false);
    setShowOnboarding(false);
  };

  return (
    <AnimatePresence>
      {showOnboarding && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            onClick={handleSkip}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="relative w-full max-w-lg bg-surface rounded-3xl shadow-soft-lg overflow-hidden"
          >
            {/* Close button */}
            <button
              onClick={handleSkip}
              className="absolute top-4 right-4 p-1.5 rounded-full text-muted hover:text-foreground hover:bg-border-light transition-colors cursor-pointer z-10"
            >
              <X className="size-4" />
            </button>

            {/* Decorative top gradient */}
            <div className="h-2 bg-gradient-to-r from-primary via-lavender to-secondary" />

            <div className="p-8 pt-6">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-lavender/15 mb-4">
                  <Sparkles className="size-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  歡迎來到 AIYO ✈️
                </h2>
                <p className="text-muted text-sm leading-relaxed">
                  讓我們一起開始規劃你的夢想旅程吧！<br />
                  告訴我一些基本資訊，AI 會幫你量身打造行程
                </p>
              </div>

              {/* Form */}
              <div className="flex flex-col gap-5">
                {/* Destination */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <MapPin className="size-4 text-secondary" />
                    你想去哪裡？
                  </label>
                  <input
                    type="text"
                    value={dest}
                    onChange={(e) => setDest(e.target.value)}
                    placeholder="例如：東京、京都、首爾..."
                    className="w-full px-4 py-3 rounded-xl border border-border bg-cream/50 text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
                  />
                </div>

                {/* Days */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                    <CalendarDays className="size-4 text-primary" />
                    想去幾天？
                  </label>
                  <input
                    type="number"
                    value={days}
                    onChange={(e) => setDaysLocal(e.target.value)}
                    placeholder="例如：5"
                    min={1}
                    max={30}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-cream/50 text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-8">
                <button
                  onClick={handleSkip}
                  className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer px-3 py-2 rounded-lg hover:bg-border-light"
                >
                  我不知道，先看看 →
                </button>
                <button
                  onClick={handleStart}
                  className="px-6 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-medium text-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  開始規劃 ✨
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
