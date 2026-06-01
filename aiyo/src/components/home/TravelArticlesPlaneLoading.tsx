"use client";

import { Plane } from "lucide-react";
import { m } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { zhTW as t } from "@/locales/zh-TW";

type TravelArticlesPlaneLoadingProps = {
  className?: string;
};

function Cloud({ className, delay = 0, duration = 12 }: { className?: string; delay?: number; duration?: number }) {
  return (
    <m.svg
      width="56"
      height="28"
      viewBox="0 0 56 28"
      fill="none"
      className={cn("absolute opacity-75", className)}
      initial={{ x: "110%" }}
      animate={{ x: "-120%" }}
      transition={{ duration, repeat: Infinity, ease: "linear", delay }}
      aria-hidden
    >
      <ellipse cx="18" cy="18" rx="14" ry="9" fill="#e2e8f0" />
      <ellipse cx="32" cy="16" rx="16" ry="10" fill="#f8fafc" />
      <ellipse cx="24" cy="14" rx="12" ry="8" fill="#ffffff" />
    </m.svg>
  );
}

export default function TravelArticlesPlaneLoading({ className }: TravelArticlesPlaneLoadingProps) {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "relative flex min-h-[148px] items-center justify-center overflow-hidden rounded-2xl border border-border-light bg-gradient-to-b from-sky-100/95 via-sky-50/85 to-primary/[0.05] sm:min-h-[160px]",
        className,
      )}
      data-testid="travel-articles-loading"
    >
      <span className="sr-only">{t.home.travelArticlesLoading}</span>

      <m.div
        className="pointer-events-none absolute size-24 rounded-full bg-white/50 blur-2xl"
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      <Cloud className="top-[22%]" delay={0} duration={11} />
      <Cloud className="top-[38%] scale-90 opacity-60" delay={2.5} duration={13} />
      <Cloud className="top-[58%] scale-75" delay={5} duration={10} />
      <Cloud className="top-[72%] scale-110 opacity-50" delay={7.5} duration={14} />

      <m.div
        className="relative z-10 flex flex-col items-center gap-2"
        animate={{ y: [0, -7, 0, 6, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      >
        <m.div
          animate={{ x: [0, 3, 0, -3, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Plane
            className="size-11 text-primary drop-shadow-md"
            strokeWidth={1.75}
            aria-hidden
          />
        </m.div>
        <m.div
          className="h-1 w-12 rounded-full bg-primary/20"
          animate={{ scaleX: [0.55, 1, 0.55], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </m.div>

      <div
        className="absolute inset-x-0 bottom-0 h-1 bg-[repeating-linear-gradient(90deg,#cbd5e1_0,#cbd5e1_8px,transparent_8px,transparent_16px)] opacity-40"
        aria-hidden
      />
    </m.div>
  );
}
