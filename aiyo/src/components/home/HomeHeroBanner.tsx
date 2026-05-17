"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { HOME_HERO_IMAGES, HOME_HERO_ROTATE_MS } from "@/data/homeHeroImages";

type Props = {
  children: React.ReactNode;
};

export default function HomeHeroBanner({ children }: Props) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [failedSrc, setFailedSrc] = useState<Record<string, true>>({});

  const visibleImages = HOME_HERO_IMAGES.filter((src) => !failedSrc[src]);
  const safeIndex = visibleImages.length > 0 ? ((heroIndex % visibleImages.length) + visibleImages.length) % visibleImages.length : 0;
  const currentSrc = visibleImages[safeIndex];

  useEffect(() => {
    if (visibleImages.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % visibleImages.length);
    }, HOME_HERO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [visibleImages.length]);

  const handleImageError = useCallback((src: string) => {
    setFailedSrc((prev) => (prev[src] ? prev : { ...prev, [src]: true }));
  }, []);

  return (
    <div className="relative h-56 w-full overflow-hidden sm:h-64 md:h-72 lg:h-80">
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-500 via-slate-400 to-slate-200"
        aria-hidden
      />

      {currentSrc ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSrc}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSrc}
              alt=""
              className="h-full w-full object-cover"
              decoding="async"
              onError={() => handleImageError(currentSrc)}
            />
          </motion.div>
        </AnimatePresence>
      ) : null}

      <div
        className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-background"
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
      >
        {children}
      </motion.div>
    </div>
  );
}
